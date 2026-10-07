import tensorflow as tf
import numpy as np


MODEL_PATH = "models/best_proposed_model.keras"


def load_model(model_path):
    model = tf.keras.models.load_model(model_path)
    return model


def prepare_input(sample):
    if sample.shape == (1000, 3):
        sample = np.expand_dims(sample, axis=0)
    else:
        raise ValueError("Input shape must be (1000, 3)")
    return sample


def predict(model, sample):
    sample = prepare_input(sample)
    prediction = model.predict(sample, verbose=0)
    return prediction


def prediction_report(prediction):
    prediction_class = np.argmax(prediction)
    confidence = np.max(prediction)
    return prediction_class, confidence