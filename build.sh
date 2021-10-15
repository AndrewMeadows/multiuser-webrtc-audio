#!/usr/bin/bash

emcc $1 -o js/addPulseTone.js \
    -s EXPORTED_RUNTIME_METHODS='["cwrap", "setValue", "getValue"]' \
    -s EXPORTED_FUNCTIONS='["_malloc", "_free"]' \
    cpp/addPulseTone.cpp
