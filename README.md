# Earthquake Event Classification

## Overview

This project focuses on earthquake event classification using seismic waveform data from the STEAD dataset.

The project compares a baseline ConvNetQuake-based model with a proposed model that incorporates maximum-amplitude information from seismic signals. The proposed approach was developed to investigate whether global amplitude characteristics can provide additional information for earthquake event classification.

The original research code is being extended into an end-to-end AI application, including an independent inference pipeline, REST API, database integration, Docker containerization, and cloud deployment.


## Dataset

This project uses the Stanford Earthquake Dataset (STEAD), which contains three-component seismic waveform data.

Each input sample is represented as:

- **Time steps:** 1,000
- **Channels:** 3
- **Input shape:** `(1000, 3)`

The waveform data is preprocessed and cropped into fixed-length samples before being passed to the classification model.

The original STEAD dataset and processed datasets are not included in this repository due to their size. Dataset inspection, preprocessing, and sample extraction are handled in `src/inspect_stead.py`.


## Model Architecture

This project contains two earthquake event classification models: a baseline model and a proposed model.

### Baseline Model

The baseline model is based on a ConvNetQuake-style convolutional neural network. It receives a three-component seismic waveform with an input shape of `(1000, 3)` and extracts temporal features through convolutional layers.

The extracted features are used to classify the seismic waveform into one of three classes.

### Proposed Model

The proposed model extends the baseline architecture by incorporating global maximum-amplitude information from the input waveform.

The waveform is processed through two feature paths:

1. **CNN Feature Path**  
   The seismic waveform is processed through convolutional layers to extract local temporal patterns.

2. **Maximum-Amplitude Feature Path**  
   The absolute amplitude of the waveform is calculated, and `GlobalMaxPooling1D` is used to extract global maximum-amplitude information. The resulting feature is transformed through fully connected layers.

The features from the CNN path and the maximum-amplitude path are then combined for final classification.

Conceptually, the architecture can be represented as:

Input `(1000, 3)`

→ CNN Feature Extraction  
→ Local waveform features

and

Input `(1000, 3)`  
→ Absolute amplitude  
→ Global Max Pooling  
→ Dense layers  
→ Global amplitude features

Finally:

CNN features + Global amplitude features  
→ Feature Fusion  
→ Classification  
→ 3 classes