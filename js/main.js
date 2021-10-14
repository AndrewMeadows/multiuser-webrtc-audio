'use strict';

// check for support of insertable streams
if (typeof MediaStreamTrackProcessor === 'undefined' ||
    typeof MediaStreamTrackGenerator === 'undefined') {
    alert("insertable streams non supported");
}

try {
    new MediaStreamTrackGenerator('audio');
    console.log("Audio insertable streams supported");
} catch (e) {
    alert("Your browser does not support insertable audio streams");
}

if (typeof AudioData === 'undefined') {
    alert("Your browser does not support WebCodecs.");
}

const SIGNALING_SERVER_URL = 'http://localhost:9999';

//// When testing on localhost, you can just use PC_CONFIG = {}
//const TURN_SERVER_URL = 'localhost:3478';
//const TURN_SERVER_USERNAME = 'username';
//const TURN_SERVER_CREDENTIAL = 'credential';
//const PC_CONFIG = {
//    iceServers: [
//        {
//            urls: 'turn:' + TURN_SERVER_URL + '?transport=tcp',
//            username: TURN_SERVER_USERNAME,
//            credential: TURN_SERVER_CREDENTIAL
//        },
//        {
//            urls: 'turn:' + TURN_SERVER_URL + '?transport=udp',
//            username: TURN_SERVER_USERNAME,
//            credential: TURN_SERVER_CREDENTIAL
//        }
//    ]
//};
const PC_CONFIG = {};

// elements
let audioElement;
let connectButton;
let disconnectButton;
let username = "unknown";

let socket;
let outbound_audio_stream;

// PeerData is a struct for tracking PeerConnection to known peer
// with intelligence about how to create/signal/destroy the connection
class PeerData {
    constructor(id, peername) {
        this.id = id;
        this.sanitized_id = getSanitizedId(id);
        this.peername = peername;
        this.connection = null;
        this.stream = null;
    }

    createConnection() {
        let id = this.id;
        try {
            let pc = new RTCPeerConnection(PC_CONFIG);
            this.connection = pc;

            pc.onconnectionstatechange = (event) => {
                // event = { type: 'connectionstatechange' }
                let state = pc.connectionState;
                console.log(`onConnectionStateChange id=${id} state=${state}`);
                updatePeerButtons();
            };

            pc.onsignalingstatechange = (event) => {
                // event = { type: 'signalingstatechange', target: pc }
                console.log(`onSignalingStateChange id=${id}`);
            };

            pc.onicegatheringstatechange = (event) => {
                // event = { type: 'icegatheringstatechange', target: pc }
                console.log(`onIceGatheringStateChange id=${id}`);
            };

            pc.onicecandidate = (event) => {
                // event = { type: 'icecandidate', candidate: ice, target: pc }
                //console.log(`onIceCandidate: id=${id} candidate=${JSON.stringify(event.candidate)}`);
                if (event.candidate) {
                    sendSignal(id, { type: 'candidate', candidate: event.candidate });
                }
            };

            pc.ontrack = (event) => {
                // event = { receiver, streams, track, transceiver }
                if (event.track.kind == 'audio') {
                    console.log(`onTrack: id=${id} connecting inbound audio to audioElement`);
                    audioElement.srcObject = event.streams[0]
                }
            }

            pc.addStream(outbound_audio_stream);
        } catch (error) {
            console.error(`PeerData.createConnection failed id=${id}: err=${error.message}`);
        }
    }

    toggleConnection() {
        let id = this.id;
        if (this.connection == null) {
            console.log(`PeerData.toggleConnection: id=${id} create`);
            this.createConnection();
            let pc = this.connection;
            if (pc) {
                pc.createOffer().then((desc) => {
                    pc.setLocalDescription(desc);
                    sendSignal(id, desc);
                },
                (error) => { console.error('offer failed: ', error); });
            }
        } else {
            // TODO: only close/cleanup if connection is open or closed
            // otherwise leave it alone (e.g. when it is in transition)
            console.log(`PeerData.toggleConnection: id=${id} close`);
            this.connection.close();
            this.connection = null;
        }
        updatePeerButtons();
    }

    handleSignal(signal) {
        let id = this.id;
        //console.log(`PeerData.handleSignal: id=${id} signal=${signal}`);
        try {
            let pc = this.connection;
            switch (signal['type']) {
                case 'offer':
                    if (pc == null) {
                        this.createConnection();
                        pc = this.connection;
                        pc.setRemoteDescription(new RTCSessionDescription(signal));
                        pc.createAnswer().then((desc) => {
                                pc.setLocalDescription(desc);
                                sendSignal(id, desc);
                            },
                            (error) => { console.error(`Send answer failed: err=${error}`); }
                        );
                        updatePeerButtons();
                    }
                    break;
                case 'answer':
                    if (pc) {
                        pc.setRemoteDescription(new RTCSessionDescription(signal));
                    }
                    break;
                case 'candidate':
                    if (pc) {
                        pc.addIceCandidate(new RTCIceCandidate(signal["candidate"]));
                    }
                    break;
            }
        } catch (e) {
            console.log(`PeerData.handleSignal: failed id=${id} err=${e.message}`);
        }
    }
};

// peers is a map from id to peername: { "id" : "peername", ... }
let peers = {};

/**  @returns The "best" audio constraints supported by the client. In this
 * case, "best" is defined as "the constraints that will produce the
 * highest-quality audio." That means disabling Echo Cancellation, disabling
 * Noise Suppression, and disabling Automatic Gain Control.
 */
function getBestAudioConstraints() {
    let audioConstraints = {};

    if (typeof (navigator) !== "undefined"
        && typeof (navigator.mediaDevices) !== "undefined"
        && typeof (navigator.mediaDevices.getSupportedConstraints) !== "undefined")
    {
        if (navigator.mediaDevices.getSupportedConstraints().echoCancellation) {
            audioConstraints.echoCancellation = false;
        }

        if (navigator.mediaDevices.getSupportedConstraints().noiseSuppression) {
            audioConstraints.noiseSuppression = false;
        }

        if (navigator.mediaDevices.getSupportedConstraints().autoGainControl) {
            audioConstraints.autoGainControl = false;
        }
    }
    return audioConstraints;
}


function sendSignal(id, signal) {
    if (socket) {
        //console.log(`SEND id=${id} signal=${signal}`);
        let message = { 'id': id, 'signal': signal };
        socket.emit('signal', message);
    }
}

function updatePeerButtons() {
    let peer_html = ""
    let disconnected_style = "background-color:LightGray"
    let connecting_style = "background-color:Yellow"
    let connected_style = "background-color:LightGreen"
    for (let [key, peer] of Object.entries(peers)) {
        let peername = peer.peername;
        let button_text = "Connect";
        let style = disconnected_style;
        if (peer.connection) {
            let state = peer.connection.connectionState;
            switch (state) {
                case ('connected'):
                    style = connected_style;
                    button_text = "Disconnect";
                    break;
                case ('disconnected'):
                    style = disconnected_style;
                    button_text = "Connect";
                    break;
                default:
                    style = connecting_style;
                    button_text = "Connecting";
                    break;
            }
        }
        let sanitized_id = peer.sanitized_id;
        // TODO: figure out if we can put non-sanitized id in onClick argument
        peer_html += `<li>${peername} <button style="${style};" id="${sanitized_id}" onClick="togglePeerConnection(this.id)">${button_text}</button></li>`;
    }
    document.querySelector('#peerList').innerHTML = peer_html;
}

async function closeAllPeerConnections() {
    for (let [key, peer] of Object.entries(peers)) {
        if (peer.connection) {
            peer.connection.close();
            peer.connection = null;
        }
    }
    peers = {}
    updatePeerButtons();
}

async function connect() {
    if (outbound_audio_stream == null) {
        let constraints = getBestAudioConstraints();
        navigator.mediaDevices.getUserMedia({ audio: constraints, video: false })
            .then((stream) => {
                outbound_audio_stream = stream;
            });
    }

    console.log("connect:");
    // Disable the Connect button after the user clicks it so we don't double-connect.
    //connectButton.innerHTML = "Connecting...";
    connectButton.disabled = true;
    disconnectButton.disabled = false;

    if (socket == null) {
        socket = io(SIGNALING_SERVER_URL, { autoConnect: false });
    }
    let data = { 'username' : username };
    socket.connect(data);

    // on 'connect' event hook up the rest of the event handlers
    socket.on('connect', (data) => {
        console.log(`RECV connect data=${JSON.stringify(data)}`);
        connectButton.innerHTML = "Connected";
        disconnectButton.innerHTML = "Disconnect";

        socket.on('peers', (data) => {
            console.log(`RECV peers: data=${JSON.stringify(data)}`);
            handlePeerData(data);
        });

        socket.on('signal', (data) => {
            //console.log(`RECV signal: data=${JSON.stringify(data)}`);
            handleSignalMessage(data);
        });

        //console.log(`SEND enter_lobby username=${username}`);
        socket.emit("enter_lobby", { 'username' : username } );
    });

    socket.on('disconnect', (data) => {
        console.log(`RECV disconnect data=${JSON.stringify(data)}`);
        connectButton.innerHTML = "Connect";
        disconnectButton.innerHTML = "Disconnected";
        closeAllPeerConnections();
    });
}

async function disconnect() {
    console.log("disconnect:");
    connectButton.disabled = false;
    disconnectButton.disabled = true;
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    closeAllPeerConnections();
}

function handlePeerData(data) {
    // data = { "enter": [ tuple, ... ], "exit": [ id, ... ] }
    // where tuple = (id, peername)
    let something_changed = false;
    if ('enter' in data) {
        let peer_list = data['enter'];
        for (var i = 0; i < peer_list.length; i++) {
            let peer = peer_list[i];
            let id = peer[0];
            let peername = peer[1];
            if (!(id in peers)) {
                peers[id] = new PeerData(id, peername);
                something_changed = true;
            }
        }
    }
    if ('exit' in data) {
        let peer_list = data['exit'];
        for (var i =0; i < peer_list.length; i++) {
            let id = peer_list[i];
            if (id in peers) {
                delete peers[id];
                something_changed = true;
            }
        }
    }
    if (something_changed) {
        updatePeerButtons();
    }
}

function getSanitizedId(id) {
    let sanitized_id = "";
    let i = 0;
    // find first alphabetic character
    while (i < id.length) {
        let c = id.charAt(i);
        if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z")) {
            break;
        }
        i++;
    }
    // skip non-alpha-numeric characters
    for (; i < id.length; i++) {
        let c = id.charAt(i);
        if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9")) {
            sanitized_id += c;
        }
    }
    return sanitized_id;
}

function togglePeerConnection(sanitized_id) {
    let button = document.querySelector(`#${sanitized_id}`);
    if (button) {
        // find the corresponding peer
        let found_peer = false;
        for (let [key, peer] of Object.entries(peers)) {
            let sanitized_key = peer.sanitized_id;
            if (sanitized_key == sanitized_id) {
                peer.toggleConnection();
                found_peer = true;
                break;
            }
        }
        if (!found_peer) {
            console.log(`togglePeerConnection did not find peer with sanitized_id=${sanitized_id}`);
        }
    }
}

function closeConnection() {
    console.log("TODO: implement closeConnection()");
}

function handleSignalMessage(message) {
    try {
        // figure out which peer sent the signal
        let id = message.id;
        let signal = message.signal;
        //console.log(`handleSignalMessage: id=${id} signal=${signal}`);
        let peer = peers[id];

        peer.handleSignal(signal);
    } catch (e) {
        //console.log(`handleSignalMessage: failed message=${JSON.stringify(message)}`);
        console.log(`handleSignalMessage: failed err=${e.message}`);
    }
}

// initialize on page load
async function init() {
    if (navigator.userAgent.indexOf("Chrome") != -1) {
        username = "Chrome";
    } else if (navigator.userAgent.indexOf("Firefox") != -1) {
        username = "Firefox";
    }
    audioElement = document.querySelector('#audioOutput');
    connectButton = document.querySelector('#connectButton');
    connectButton.onclick = connect;
    connectButton.disabled = false;
    connectButton.innerHTML = "Connect";

    disconnectButton = document.querySelector('#disconnectButton');
    disconnectButton.onclick = disconnect;
    disconnectButton.disabled = true;
    disconnectButton.innerHTML = "Disconnected";
}

init();

