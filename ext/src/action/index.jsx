"use strict";

import React, { Component } from "react";
import ReactDOM             from "react-dom";

const _ = browser.i18n.getMessage;


class Receiver extends Component {
    constructor (props) {
        super(props);

        console.log(props.receiver);
    }

    render () {
        console.log(this.props.receiver)
        return (
            <details className="receiver">
                <summary>
                    <div className="receiver__stop">
                        <button>
                            Stop
                        </button>
                    </div>
                    <div className="receiver__name">
                        { this.props.receiver.friendlyName }
                    </div>
                    <div className="receiver__current-app">
                        { this.props.receiver.application.statusText }
                    </div>
                </summary>
                <div className="receiver__controls">
                    <button className="receiver__control receiver__control--mute"></button>
                    <input className="receiver__control receiver__control--volume"
                           type="range"
                           min="0"
                           max="1"
                           step="0.1"
                           value={ this.props.receiver.volume.level } />
                </div>
            </details>
        );
    }
}

class App extends Component {
    constructor () {
        super();

        this.state = {
            receivers: []
          , isLoading: true
        };
    }

    componentDidMount () {
        const port = browser.runtime.connect({
            name: "action"
        });

        port.postMessage({
            subject: "main:actionReady"
        });

        port.onMessage.addListener(message => {
            this.setState({
                isLoading: false
            });

            switch (message.subject) {
                case "action:populate": {
                    this.setState({
                        receivers: message.data
                    });
                    
                    break;
                }

                case "action:statusUpdate": {
                    const receiver = message.data;
                    this.setState(currentState => {
                        currentState.receivers = currentState.receivers
                            .map(r => r.id === receiver.id
                                    ? receiver
                                    : r)

                        return currentState;
                    });
                }
            }
        })

        setTimeout(() => {
            this.setState({
                isLoading: false
            });
        }, 5000);
    }

    onVolumeChange (receiverId, level) {
        console.log("onVolumeChange", level);
    }

    render () {
        return (
            do {
                if (this.state.isLoading) {
                    <div class="message message--loading">
                        <img alt="loading" src="assets/spinner.svg" />
                    </div>
                } else {
                    if (this.state.receivers.length) {
                        <ul className="receivers">
                            { this.state.receivers.map((receiver, i) => (
                                <Receiver receiver={ receiver }
                                          onVolumeChange={ this.onVolumeChange }
                                          key={ i } />
                            ))}
                        </ul>
                    } else {
                        <div class="message message-empty">
                            No receivers found...
                        </div>
                    }
                }
            }
        );
    }
}


ReactDOM.render(
    <App />
  , document.querySelector("#root"));
