"""Run from earthquake_project with the existing h5py environment. Read only."""
import json
from pathlib import Path
import h5py
import numpy as np

root = Path(__file__).resolve().parents[2]
sample_id = "152A.N4_20180623135517_EV"
with h5py.File(root / "data/raw/merged/merge.hdf5", "r") as source:
    dataset = source["data"][sample_id]
    waveform = dataset[100:1100, :]
    if waveform.shape != (1000, 3) or not np.isfinite(waveform).all():
        raise ValueError("Expected finite (1000, 3) waveform")
    print("Source shape:", dataset.shape, "crop:", waveform.shape)
    print("P arrival:", dataset.attrs.get("p_arrival_sample"))
payload = {"sample_id": sample_id, "waveform": waveform.tolist()}
destination = root / "seismic-ai-dashboard/data/stead-sample.json"
destination.write_text(json.dumps(payload, allow_nan=False, separators=(",", ":")), encoding="utf-8")
print("Exported:", destination.name)
