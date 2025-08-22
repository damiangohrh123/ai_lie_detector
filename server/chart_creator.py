import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np

# Before confusion matrix
cm_before = np.array([
    [0, 0, 3, 12],
    [10, 3, 2, 0],
    [0, 0, 1, 14],
    [0, 0, 0, 15]
])

# After confusion matrix
cm_after = np.array([
    [1, 2, 2, 10],
    [7, 6, 1, 1],
    [2, 1, 1, 11],
    [0, 0, 0, 15]
])

labels = ["Neutral", "Happy", "Sad", "Angry"]

fig, axes = plt.subplots(1, 2, figsize=(12, 5))

# Before
sns.heatmap(cm_before, annot=True, fmt="d", cmap="Reds",
            xticklabels=labels, yticklabels=labels, ax=axes[0])
axes[0].set_title("Confusion Matrix - Before")
axes[0].set_xlabel("Predicted Label")
axes[0].set_ylabel("True Label")

# After
sns.heatmap(cm_after, annot=True, fmt="d", cmap="Blues",
            xticklabels=labels, yticklabels=labels, ax=axes[1])
axes[1].set_title("Confusion Matrix - After")
axes[1].set_xlabel("Predicted Label")
axes[1].set_ylabel("True Label")

plt.tight_layout()
plt.show()