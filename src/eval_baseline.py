import tensorflow as tf
import numpy as np
from sklearn.metrics import confusion_matrix, classification_report

eval_file = np.load('data/processed/crop_ev.npz')

x_eval = eval_file['data'].reshape(-1, 1000, 3)
y_eval = eval_file['label']


def balance_data(X, y, n_per_class, seed=42):
    rng = np.random.default_rng(seed)

    selected = []

    for label in [0, 1, 2]:
        idx = np.where(y == label)[0]
        chosen = rng.choice(idx, size=n_per_class, replace=False)
        selected.extend(chosen)

    selected = np.array(selected)
    rng.shuffle(selected)

    return X[selected], y[selected]
x_eval, y_eval = balance_data(
    x_eval, y_eval, 2000
)

print("x_eval:", x_eval.shape)
print("y_eval:", y_eval.shape)
best_model = tf.keras.models.load_model(
    'models/baseline_best_model.keras'
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