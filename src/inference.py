import tensorflow as tf
import numpy as np
from sklearn.metrics import confusion_matrix, classification_report


MODEL_PATH = "models/best_proposed_model.keras"
eval_file = np.load('data/processed/crop_ev.npz')
X_test = eval_file['data'].reshape(-1, 1000, 3)
y_test = eval_file['label']


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

def prediction_cls(prediction):
    prediction_class = np.argmax(prediction)
    confidence = np.max(prediction)
    return prediction_class, confidence

model = load_model(MODEL_PATH)
prediction = predict(model, X_test[0])
prediction_class, confidence = prediction_cls(prediction)

print("prediction_class:", prediction_class)
print("confidence:", confidence)

