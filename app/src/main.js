import dnssd from "dnssd";

import http from "http";
import fs from "fs";
import path from "path";
 import { Client } from "castv2";

import * as transforms from "./transforms";
import Media from "./Media";
import Session from "./Session";

import { __applicationName
       , __applicationVersion } from "../package.json";


const browser = dnssd.Browser(dnssd.tcp("googlecast"));

// Local media server
let httpServer;

process.on("SIGTERM", () => {
    if (httpServer) httpServer.close();
});

// Increase listener limit
require("events").EventEmitter.defaultMaxListeners = 50;

// stdin -> stdout
process.stdin
    .pipe(transforms.decode)
    .pipe(transforms.response(handleMessage))
    .pipe(transforms.encode)
    .pipe(process.stdout);

/**
 * Encode and send a message to the extension.
 */
function sendMessage (message) {
    try {
        transforms.encode.write(message);
    } catch (err) {}
}


// Existing counterpart Media/Session objects
const existingSessions = new Map();
const existingMedia = new Map();

/**
 * Handle incoming messages from the extension and forward
 * them to the appropriate handlers.
 *
 * Initializes the counterpart objects and is responsible
 * for managing existing ones.
 */
async function handleMessage (message) {
    if (message.subject.startsWith("bridge:bridgemedia/")) {
        if (existingMedia.has(message._id)) {
            // Forward message to instance message handler
            existingMedia.get(message._id).messageHandler(message);
        } else {
            if (message.subject.endsWith("/initialize")) {
                // Get Session object media belongs to
                const parentSession = existingSessions.get(
                        message.data._internalSessionId);

                // Create Media
                existingMedia.set(message._id, new Media(
                        message.data.sessionId
                      , message.data.mediaSessionId
                      , message._id
                      , parentSession
                      , sendMessage));
            }
        }

        return;
    }

    if (message.subject.startsWith("bridge:bridgesession/")) {
        if (existingSessions.has(message._id)) {
            // Forward message to instance message handler
            existingSessions.get(message._id).messageHandler(message);
        } else {
            if (message.subject.endsWith("/initialize")) {
                // Create Session
                existingSessions.set(message._id, new Session(
                        message.data.address
                      , message.data.port
                      , message.data.appId
                      , message.data.sessionId
                      , sendMessage));
            }
        }

        return;
    }


    switch (message.subject) {
        case "watchStatus": {
            watchStatus();
            break;
        };

        case "bridge:getInfo": {
            const extensionVersion = message.data;

            return {
                subject: "main:bridgeInfo"
              , data: __applicationVersion
            };
        };

        case "bridge:discover": {
            discover();
            break;
        };

        case "bridge:startHttpServer": {
            const { filePath, port } = message.data;

            httpServer = http.createServer((req, res) => {
                const { size: fileSize } = fs.statSync(filePath);
                const { range } = req.headers;

                // Partial content HTTP 206
                if (range) {
                    const bounds = range.substring(6).split("-");

                    const start = parseInt(bounds[0]);
                    const end = bounds[1]
                        ? parseInt(bounds[1])
                        : fileSize - 1;

                    const chunkSize = (end - start) + 1;

                    res.writeHead(206, {
                        "Accept-Ranges": "bytes"
                      , "Content-Range": `bytes ${start}-${end}/${fileSize}`
                      , "Content-Length": chunkSize
                      , "Content-Type": "video/mp4"
                    });

                    fs.createReadStream(filePath, { start, end }).pipe(res);

                } else {
                    res.writeHead(200, {
                        "Content-Length": fileSize
                      , "Content-Type": "video/mp4"
                    });

                    fs.createReadStream(filePath).pipe(res)
                }
            });

            httpServer.listen(port, () => {
                sendMessage({
                    subject: "mediaCast:httpServerStarted"
                });
            });

            break;
        };

        case "bridge:stopHttpServer":
            if (httpServer) httpServer.close();
            break;
    }
}

function watchStatus () {
    browser.on("serviceUp", service => {
        const host = service.addresses[0];
        const port = service.port;

        sendMessage({
            subject: "statusServiceUp"
          , data: {
                address: host
              , port
              , id: service.txt.id
              , friendlyName: service.txt.fn
            }
        });

        const client = new Client();

        client.connect({ host, port }, () => {
            const connection = client.createChannel(
                    "sender-0", "receiver-0"
                  , "urn:x-cast:com.google.cast.tp.connection", "JSON");
            const heartbeat = client.createChannel(
                    "sender-0", "receiver-0"
                  , "urn:x-cast:com.google.cast.tp.heartbeat", "JSON");
            const receiver = client.createChannel(
                    "sender-0", "receiver-0"
                  , "urn:x-cast:com.google.cast.receiver", "JSON");

            receiver.on("message", data => {
                if (data.type !== "RECEIVER_STATUS") {
                    return;
                }

                sendMessage({
                    subject: "statusUpdate"
                  , data: {
                        id: service.txt.id
                      , status: data.status
                    }
                });
            });

            connection.send({ type: "CONNECT" });
            heartbeat.send({ type: "PING" });
            receiver.send({ type: "GET_STATUS", requestId: 1 });

            setInterval(() => {
                heartbeat.send({ type: "PING" });
            }, 5000)
        });
    });

    browser.on("serviceDown", service => {
        sendMessage({
            subject: "statusServiceDown"
          , data: {
                id: service.txt.id
            }
        });
    });

    browser.start()
}

function discover () {
    browser.on("serviceUp", service => {
        transforms.encode.write({
            subject: "shim:serviceUp"
          , data: {
                address: service.addresses[0]
              , port: service.port
              , id: service.txt.id
              , friendlyName: service.txt.fn
              , currentApp: service.txt.rs
            }
        });
    });

    browser.on("serviceDown", service => {
        transforms.encode.write({
            subject:"shim:serviceDown"
          , data: {
                id: service.txt.id
            }
        });
    });

    browser.start();
}

