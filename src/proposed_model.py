import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, models
import keras
# =========================
# 1. 데이터 불러오기
# =========================

train_file = np.load('data/processed/augmented_tr.npz')
test_file = np.load('data/processed/crop_te.npz')

X_train = train_file['data'].reshape(-1,1000, 3)
y_train = train_file['label']

X_test = test_file['data'].reshape(-1,1000, 3)
y_test = test_file['label']

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
print("X_train:", X_train.shape)
print("y_train:", y_train.shape)
print("X_test :", X_test.shape)
print("y_test :", y_test.shape)


# =========================
# 2. Baseline CNN
# =========================


inputs = layers.Input(shape=(1000, 3))
# Normalization

mean = tf.reduce_mean(inputs, axis=1, keepdims=True)
std = tf.math.reduce_std(inputs, axis=1, keepdims=True)

normalized = (inputs - mean) / (std + 1e-8)
# Global branch
global_feature = tf.abs(inputs)
global_feature = layers.GlobalMaxPooling1D()(global_feature)
global_feature = layers.Dense(1)(global_feature)
global_feature = layers.ReLU()(global_feature)

global_feature = layers.Dense(3)(global_feature)
global_feature = layers.ReLU()(global_feature)


# Main CNN branch: Conv 1 ~ Conv 8)
x = layers.Conv1D(32, 3, strides=2, padding='same', activation='relu')(normalized)
x = layers.Conv1D(32, 3, strides=2, padding='same', activation='relu')(x)
x = layers.Conv1D(32, 3, strides=2, padding='same', activation='relu')(x)
x = layers.Conv1D(32, 3, strides=2, padding='same', activation='relu')(x)
x = layers.Conv1D(32, 3, strides=2, padding='same', activation='relu')(x)
x = layers.Conv1D(32, 3, strides=2, padding='same', activation='relu')(x)
x = layers.Conv1D(32, 3, strides=2, padding='same', activation='relu')(x)
x = layers.Conv1D(32, 3, strides=2, padding='same', activation='relu')(x)

# (4, 32) → 128
cnn_feature = layers.Flatten()(x)

# 128 + 3 → 131
enhanced_feature = layers.Concatenate()([
    cnn_feature,
    global_feature
])

# 3-class classification
outputs = layers.Dense(
    3,
    activation='softmax'
)(enhanced_feature)


# ★ 여기서 위의 모든 구조를 하나의 model로 묶음
model = models.Model(
    inputs=inputs,
    outputs=outputs
)
# =========================
# 3. Compile
# =========================

model.compile(
    optimizer='adam',
    loss='sparse_categorical_crossentropy',
    metrics=['accuracy']
)

model.summary()


# =========================
# 4. Train
# =========================

checkpoint = tf.keras.callbacks.ModelCheckpoint(
    filepath='models/best_proposed_model.keras',
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