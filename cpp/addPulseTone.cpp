// addPulseTone.cpp
//

#include <cmath>
#include <cstdint>
#include <iostream>

#include <emscripten.h>

extern "C" {

const float TWO_PI = 6.283185307179586f;

void EMSCRIPTEN_KEEPALIVE addPulseTone(float* pulseOscillator, float* toneOscillator, float* block) {
    // ocillator = [ omega, phase ]
    float pulseOmega = pulseOscillator[0];
    float pulsePhase = pulseOscillator[1];
    float toneOmega = toneOscillator[0];
    float tonePhase = toneOscillator[1];

    // block = [ num_channels, num_frames, sample_rate, data... ]
    int32_t num_channels = (int32_t)(block[0]);
    int32_t num_frames = (int32_t)(block[1]);
    float dt = 1.0f / block[2];

    float* data = block + 3;
    for (int32_t i = 0; i < num_channels; ++i) {
        int32_t offset = i * num_frames;
        for (int32_t j = 0; j < num_frames; ++j) {
            float t = (float)j * dt;
            float a = std::sin(tonePhase + toneOmega * t);
            float b = std::sin(pulsePhase + pulseOmega * t);
            int32_t k = offset + j;
            data[k] = std::fmin(std::fmax(-1.0f, data[k] + 0.5f * a * b * b), 1.0f);
        }
    }

    // update oscillator phases
    float t = (float)(num_frames) * dt;
    tonePhase += toneOmega * t;
    if (tonePhase > TWO_PI) {
        tonePhase -= TWO_PI;
    }
    toneOscillator[1] = tonePhase;
    pulsePhase += pulseOmega * t;
    if (pulsePhase > TWO_PI) {
        pulsePhase -= TWO_PI;
    }
    pulseOscillator[1] = pulsePhase;
}

} // extern
