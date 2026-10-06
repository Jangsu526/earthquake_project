import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, models
import keras
# =========================
# 1. 데이터 불러오기
# =========================
from tensorflow.keras.utils import to_categorical


train_file = np.load('data/processed/augmented_tr.npz')
test_file = np.load('data/processed/crop_te.npz')

X_train = train_file['data'].reshape(-1,1000, 3)
y_train = train_file['label']

X_test = test_file['data'].reshape(-1,1000, 3)
y_test = test_file['label']


print("X_train:", X_train.shape)
print("y_train:", y_train.shape)
print("X_test :", X_test.shape)
print("y_test :", y_test.shape)


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
X_train, y_train = balance_data(
    X_train, y_train, 38000
)
X_test, y_test = balance_data(
    X_test, y_test, 2400
)
# =========================
# 2. Baseline CNN
# =========================

inputs = layers.Input(shape=(1000, 3))
mean = tf.reduce_mean(inputs, axis=1, keepdims=True)
std = tf.math.reduce_std(inputs, axis=1, keepdims=True)
x = (inputs - mean) / (std + 1e-8)

#max = tf.reduce_max(inputs, axis=1, keepdims=True)
#min = tf.reduce_min(inputs, axis=1, keepdims=True)
#x = (inputs - min) / (max - min)

# =========================
# 4. ConvNetQuake
# =========================

# Conv 1 : 1000 → 500
x = layers.Conv1D(
    32, 3,
    strides=2,
    padding='same',
    activation='relu'
)(x)

# Conv 2 : 500 → 250
x = layers.Conv1D(
    32, 3,
    strides=2,
    padding='same',
    activation='relu'
)(x)

# Conv 3 : 250 → 125
x = layers.Conv1D(
    32, 3,
    strides=2,
    padding='same',
    activation='relu'
)(x)

# Conv 4 : 125 → 63
x = layers.Conv1D(
    32, 3,
    strides=2,
    padding='same',
    activation='relu'
)(x)

# Conv 5 : 63 → 32
x = layers.Conv1D(
    32, 3,
    strides=2,
    padding='same',
    activation='relu'
)(x)

# Conv 6 : 32 → 16
x = layers.Conv1D(
    32, 3,
    strides=2,
    padding='same',
    activation='relu'
)(x)

# Conv 7 : 16 → 8
x = layers.Conv1D(
    32, 3,
    strides=2,
    padding='same',
    activation='relu'
)(x)

# Conv 8 : 8 → 4
x = layers.Conv1D(
    32, 3,
    strides=2,
    padding='same',
    activation='relu'
)(x)


# =========================
# 5. Flatten
# (4 × 32 = 128)
# =========================

x = layers.Flatten()(x)


# =========================
# 6. Classification
# =========================

outputs = layers.Dense(
    3,
    activation='softmax'
)(x)


# ★ 여기서 위의 모든 구조를 하나의 model로 묶음
model = models.Model(
    inputs=inputs,
    outputs=outputs
)
# =========================
# 3. Compile
# =========================
learning_rate = 0.001
optimizer = tf.keras.optimizers.Adam(
    learning_rate=learning_rate
)
model.compile(
    optimizer=optimizer,
    loss='sparse_categorical_crossentropy',
    metrics=['accuracy'],
)
model.summary()


# =========================
# 4. Train
# =========================

checkpoint = tf.keras.callbacks.ModelCheckpoint(
    filepath='models/baseline_best_model.keras',
    monitor='val_loss',
    save_best_only=True,
    mode='min',
    verbose=1
)

history = model.fit(
    X_train,
    y_train,
    batch_size=256,
    epochs=100,
    validation_data=(X_test, y_test),
    callbacks=[checkpoint]
)

print("Best val_accuracy", max(history.history['val_accuracy']))