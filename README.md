# multiuser-webrtc-audio
Simple multi-user webrtc audio demo

## How to run:
1) Install **emsdk** and make it available to your environment
1) Run the `build.sh` script to compile the `addPulseTone.cpp` file
1) Run signal server: `python signal-server.py`
1) Run http server on two computers, this one and a spare: `python -m http.server`
1) On the spare computer modify the main.js script to point to signal server's IP address instead of localhost.
1) Also modify main.js script to give a distinct username.
1) On each computer: open Chrome94+ tab and visit: localhost:8000
1) Connect to signal server on each computer --> each user should see the other listed
1) Connect WebRTC between UserA and UserB
1) NOT WORKING YET: Each User should hear a pulsed tone on top of their peer's audio.  This tone is being added at the receiving side.
