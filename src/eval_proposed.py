import tensorflow as tf
import numpy as np
from sklearn.metrics import confusion_matrix, classification_report

eval_file = np.load('data/processed/crop_ev.npz')

x_eval = eval_file['data'].reshape(-1, 1000, 3)
y_eval = eval_file['label']

print("x_eval:", x_eval.shape)
print("y_eval:", y_eval.shape)
best_model = tf.keras.models.load_model(
    'models/best_proposed_model.keras'
)


y_prob = best_model.predict(x_eval, batch_size=32)
y_pred = np.argmax(y_prob, axis=1)
print(confusion_matrix(y_eval, y_pred))

print(
    classification_report(
        y_eval,
        y_pred,
        target_names=["Micro", "Macro", "Noise"],
        digits=4
    )
)
print("Eval Loss:", output[0])
print("Eval Accuracy:", output[1])