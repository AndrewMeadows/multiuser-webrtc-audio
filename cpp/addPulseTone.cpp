// addPulseTone.cpp
//

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <iostream>

#include <emscripten.h>

extern "C" {

constexpr float TWO_PI = 6.283185307179586f;


void EMSCRIPTEN_KEEPALIVE addPulseTone(float* pulseOscillator, float* toneOscillator, float* block, float rightShift) {
    // ocillator = [ omega, phase ]
    float pulseOmega = pulseOscillator[0];
    float pulsePhase = pulseOscillator[1];
    float toneOmega = toneOscillator[0];
    float tonePhase = toneOscillator[1];

    // rightShift=0 --> left ear
    // rightShift=1 --> right ear
    // rightShift=0.5 --> midpoint between ears

    // block = [ num_channels, num_frames, sample_rate, data... ]
    int32_t num_channels = (int32_t)(block[0]);
    int32_t num_frames = (int32_t)(block[1]);
    float dt = 1.0f / block[2];

    // If num_channels is 1 (mono) then we will modify and upmix to stereo.
    // If num_channels is 2 or more (stereo+) we will modify the first two channels.
    // In either case we always output stereo.
    // Note: for stereo data: index_0=left and index_1=right
    constexpr int32_t NUM_STEREO_CHANNELS = 2;

    // assume mono input, in which case we have only one source channel
    // since we write over the input data we will have to write
    // to the second channel (right ear) first so we don't overwrite
    // the input (left ear) until the very end
    int32_t input_offsets[NUM_STEREO_CHANNELS] = { 0, 0 };
    int32_t output_offsets[NUM_STEREO_CHANNELS] = { num_frames, 0 };

    // rightShift determines how much signal goes into the right (1.0) vs left (0.0) ear.
    // As per the aforementioned "write over" problem we will do the right ear first
    // so the order of signal_amplitudes is { right, left }
    rightShift = std::clamp(rightShift, 0.0f, 1.0f);
    constexpr float amplitude = 0.5f;
    float signal_amplitudes[NUM_STEREO_CHANNELS] = { amplitude * rightShift, amplitude * (1.0f - rightShift) };

    if (num_channels >= NUM_STEREO_CHANNELS) {
        // we have stereo input --> adjust right ear input
        input_offsets[0] = num_frames;
    }

    float* data = block + 3;
    for (int32_t i = 0; i < NUM_STEREO_CHANNELS; ++i) {
        int32_t input_offset = input_offsets[i];
        int32_t output_offset = output_offsets[i];
        float amplitude = signal_amplitudes[i];
        for (int32_t j = 0; j < num_frames; ++j) {
            float t = (float)j * dt;
            float a = std::sin(tonePhase + toneOmega * t);
            float b = std::sin(pulsePhase + pulseOmega * t);
            int32_t input_index = input_offset + j;
            int32_t output_index = output_offset + j;
            float signal = amplitude * a * b * b;
            data[output_index] = std::fmin(std::fmax(-1.0f, data[input_index] + signal), 1.0f);
        }
    }

    // Note: we update the memory where num_channels is stored
    // to reflect the true number of channels written.
    // It will be the duty of the JS transform to read this number when
    // enqueuing each AudioData block
    block[0] = (float)(NUM_STEREO_CHANNELS);

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
