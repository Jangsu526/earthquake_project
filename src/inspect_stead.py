import h5py
import numpy as np
import pandas as pd
import random
from datetime import datetime
from sklearn.model_selection import train_test_split
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

csv_file = BASE_DIR / "data" / "raw" / "merged" / "merge.csv"
hdf5_file = BASE_DIR / "data" / "raw" / "merged" / "merge.hdf5"
output_dir = BASE_DIR / "data" / "processed"
output_dir.mkdir(parents=True, exist_ok=True)
# reading the csv file into a dataframe:
df = pd.read_csv(csv_file)
print('total events in csv file: {%f}' % (len(df)))
refer_t1 = datetime.strptime('1/1/09', '%m/%d/%y')
refer_t2 = datetime.strptime('6/6/17', '%m/%d/%y')

df_noi = df[(df.trace_category == 'noise') & (df.receiver_type == 'HH')]
df_mi = df[(df.trace_category == 'earthquake_local') & (df.receiver_type == 'HH') & (df.source_distance_km >100) & (df.source_distance_km <200) & (df.source_magnitude < 3)&(pd.to_datetime(df.source_origin_time) > refer_t1)&(pd.to_datetime(df.source_origin_time) < refer_t2) ]
df_ma = df[(df.trace_category == 'earthquake_local') & (df.receiver_type == 'HH') & (df.source_distance_km >100) & (df.source_distance_km <200) & (df.source_magnitude >= 3)&(pd.to_datetime(df.source_origin_time) > refer_t1)&(pd.to_datetime(df.source_origin_time) < refer_t2) ]
df_mi_ev = df[(df.trace_category == 'earthquake_local') & (df.receiver_type == 'HH') & (df.source_distance_km <200) & (df.source_magnitude < 3)&(pd.to_datetime(df.source_origin_time) > refer_t2)]
df_ma_ev = df[(df.trace_category == 'earthquake_local') & (df.receiver_type == 'HH') & (df.source_distance_km <200) & (df.source_magnitude >= 3)&(pd.to_datetime(df.source_origin_time) > refer_t2)]

df_noi_tr, df_noi_temp = train_test_split(df_noi,train_size=0.7,test_size=0.3,random_state=42)
df_noi_te, df_noi_ev = train_test_split(df_noi_temp,train_size=2/3,test_size=1/3,random_state=42)
df_mi_tr, df_mi_te = train_test_split(df_mi, train_size=0.8, test_size=0.2,random_state=42)
df_ma_tr, df_ma_te = train_test_split(df_ma, train_size=0.8, test_size=0.2,random_state=42)

print('total_train_micro( < 3.0) events selected_tr: {%d}' % (len(df_mi_tr)))
print('total_train_macro( >=3.0) events selected_tr: {%d}' % (len(df_ma_tr)))
print('total_train_noise( < 0.0) events selected_tr: {%d}' % (len(df_noi_tr)))
print('total_test_micro( < 3.0) events selected_te: {%d}' % (len(df_mi_te)))
print('total_test_macro( >=3.0) events selected_te: {%d}' % (len(df_ma_te)))
print('total_test_noise( < 0.0) events selected_te: {%d}' % (len(df_noi_te)))
print('total_eval_micro( < 3.0) events selected_ev: {%d}' % (len(df_mi_ev)))
print('total_eval_macro( >=3.0) events selected_ev: {%d}' % (len(df_ma_ev)))
print('total_eval_noise( < 0.0) events selected_ev: {%d}' % (len(df_noi_ev)))

# making a list of trace names for the selected data

ev_list_noi_tr = df_noi_tr['trace_name'].tolist()
ev_list_mi_tr = df_mi_tr['trace_name'].tolist()
ev_list_ma_tr = df_ma_tr['trace_name'].tolist()

ev_list_noi_te = df_noi_te['trace_name'].tolist()
ev_list_mi_te = df_mi_te['trace_name'].tolist()
ev_list_ma_te = df_ma_te['trace_name'].tolist()

ev_list_noi_ev = df_noi_ev['trace_name'].tolist()
ev_list_mi_ev = df_mi_ev['trace_name'].tolist()
ev_list_ma_ev = df_ma_ev['trace_name'].tolist()


dtfl = h5py.File(hdf5_file, 'r')
s_num_noi_tr = range(len(ev_list_noi_tr))
s_num_mi_tr = range(len(ev_list_mi_tr))
s_num_ma_tr = range(len(ev_list_ma_tr))

s_num_noi_te = range(len(ev_list_noi_te))
s_num_mi_te = range(len(ev_list_mi_te))
s_num_ma_te = range(len(ev_list_ma_te))

s_num_noi_ev = range(len(ev_list_noi_ev))
s_num_mi_ev = range(len(ev_list_mi_ev))
s_num_ma_ev = range(len(ev_list_ma_ev))





s_num_noi_tr = random.sample(s_num_noi_tr,40000)
# s_num_mi_tr = random.sample(s_num_mi_tr,9640)
# s_num_ma_tr = random.sample(s_num_ma_tr,1000)

s_num_noi_te = random.sample(s_num_noi_te,2410)
# s_num_mi_te = random.sample(s_num_mi_te,1000)
# s_num_ma_te = random.sample(s_num_ma_te,1000)

s_num_noi_ev = random.sample(s_num_noi_ev, 2123)
s_num_mi_ev = random.sample(s_num_mi_ev, 2123)
s_num_ma_ev = random.sample(s_num_ma_ev, 2123)

######################################################

arr_ear_tr = []
y_label_each_ev_tr = []
tr_margin_samples = [0, 100, 200, 300]
tr_extract_sample = 1000

# for i, c in enumerate(s_num_mi_tr):
#     evi = ev_list_mi_tr[c]
#     dataset = dtfl["data"][evi]
#     data = np.array(dataset)

#     p_picking = dataset.attrs['p_arrival_sample']

#     for margin_sample in tr_margin_samples:
#         ext_start = int(p_picking - margin_sample)
#         ext_end = ext_start + tr_extract_sample

#         if ext_start >= 0 and ext_end <= data.shape[0]:
#             ext_data = data[ext_start:ext_end, :]
#             ext_data_reshape = ext_data.reshape(1, 1000, 3)

#             arr_ear_tr.append(ext_data_reshape)
#             y_label_each_ev_tr.append(0)
#     if i % 100 == 0:
#         print(f"[TRAIN] Micro: {i}/{len(s_num_mi_tr)} Augmentation processed")
# print("[TRAIN] Micro processing done")

# for i, c in enumerate(s_num_ma_tr):
#     evi = ev_list_ma_tr[c]
#     dataset = dtfl["data"][evi]    
#     data = np.array(dataset)
#     p_picking = dataset.attrs['p_arrival_sample']
#     s_picking = dataset.attrs['s_arrival_sample']
#     for margin_sample in tr_margin_samples:
#         ext_start = int(p_picking - margin_sample)
#         ext_end = ext_start + tr_extract_sample
#         if ext_start >= 0 and ext_end <= data.shape[0]:
#             ext_data = data[ext_start:ext_end, :]
#             ext_data_reshape = ext_data.reshape(1, 1000, 3)
#             arr_ear_tr.append(ext_data_reshape)
#             y_label_each_ev_tr.append(1)
#     if i % 100 == 0:
#         print(f"[TRAIN] Macro: {i}/{len(s_num_ma_tr)} Augmentation processed")
# print("[TRAIN] Macro processing done")

# for i, c in enumerate(s_num_noi_tr):
#     evi = ev_list_noi_tr[c]
#     dataset = dtfl["data"][evi]    
#     data = np.array(dataset)
#     ext_data = data[1000:2000, :]
#     ext_data_reshape = ext_data.reshape(1, 1000, 3)
#     arr_ear_tr.append(ext_data_reshape)
#     y_label_each_ev_tr.append(2)
#     if i % 100 == 0:
#             print(f"[TRAIN] Noise: {i}/{len(s_num_noi_tr)} Crop processed")
# print("[TRAIN] Noise processing done")
# ENZ_arr_ear_tr = np.array(arr_ear_tr, dtype=float)
# ENZ_ylabel_each_ev_tr = np.array(y_label_each_ev_tr, dtype=int)
# print(f"Train samples : {len(ENZ_arr_ear_tr)}")
# print("\nTrain shape :", ENZ_arr_ear_tr.shape)
# print("\nTrain labels:")
# unique, counts = np.unique(ENZ_ylabel_each_ev_tr, return_counts=True)
# print(dict(zip(unique, counts)))


# np.savez(
#     output_dir / "processed_tr.npz",
#     data=ENZ_arr_ear_tr,
#     label=ENZ_ylabel_each_ev_tr
# )



te_margin_samples = [300]
te_extract_sample = 1000
arr_ear_te = []
y_label_each_ev_te = []

for i, c in enumerate(s_num_mi_te):
    evi = ev_list_mi_te[c]
    dataset = dtfl["data"][evi]    
    data = np.array(dataset)

    p_picking = dataset.attrs['p_arrival_sample']
    s_picking = dataset.attrs['s_arrival_sample']

    for margin_sample in te_margin_samples:
        ext_start = int(p_picking - margin_sample)
        ext_end = int(ext_start + te_extract_sample)
        if ext_start >= 0 and ext_end <= data.shape[0]:
            ext_data = data[ext_start:ext_end, :]
            ext_data_reshape = ext_data.reshape(1, 1000, 3)
            arr_ear_te.append(ext_data_reshape)
            y_label_each_ev_te.append(0)
    if i % 100 == 0:
        print(f"[TEST] Micro: {i}/{len(s_num_mi_te)} Augmentation processed")
print("[TEST] Micro processing done")

for i, c in enumerate(s_num_ma_te):

    evi = ev_list_ma_te[c]
    dataset = dtfl["data"][evi]    
    data = np.array(dataset)
    p_picking = dataset.attrs['p_arrival_sample']
    s_picking = dataset.attrs['s_arrival_sample']
    for margin_sample in te_margin_samples:
        ext_start = int(p_picking - margin_sample)
        ext_end = int(ext_start + te_extract_sample)
        if ext_start >= 0 and ext_end <= data.shape[0]:
            ext_data = data[ext_start:ext_end, :]
            ext_data_reshape = ext_data.reshape(1, 1000, 3)
            arr_ear_te.append(ext_data_reshape)
            y_label_each_ev_te.append(1)
    if i % 100 == 0:
        print(f"[TEST] Macro: {i}/{len(s_num_ma_te)} Augmentation processed")
print("[TEST] Macro processing done")

for i, c in enumerate(s_num_noi_te):
    evi = ev_list_noi_te[c]
    dataset = dtfl["data"][evi]    
    data = np.array(dataset)
    ext_data = data[1000:2000, :]
    ext_data_reshape = ext_data.reshape(1, 1000, 3)
    arr_ear_te.append(ext_data_reshape)
    y_label_each_ev_te.append(2)
    if i % 100 == 0:
        print(f"[TEST] Noise: {i}/{len(s_num_noi_te)} Crop processed")


ENZ_arr_ear_te = np.array(arr_ear_te, dtype=float)
ENZ_ylabel_each_ev_te = np.array(y_label_each_ev_te, dtype=int)
print(f"Test samples  : {len(ENZ_arr_ear_te)}")
print("Test shape  :", ENZ_arr_ear_te.shape)
print("Test labels:")
unique, counts = np.unique(ENZ_ylabel_each_ev_te, return_counts=True)
print(dict(zip(unique, counts)))
np.savez(
    output_dir / "crop_te.npz",
    data=ENZ_arr_ear_te,
    label=ENZ_ylabel_each_ev_te
)

# arr_ear_ev = []
# y_label_each_ev_ev = []

# # Micro
# for i, c in enumerate(s_num_mi_ev):
#     evi = ev_list_mi_ev[c]
#     dataset = dtfl["data"][evi]
#     data = np.array(dataset)

#     p_picking = dataset.attrs["p_arrival_sample"]
#     margin_sample = 300
#     ext_start = int(p_picking - margin_sample)
#     ext_end = ext_start + 1000
#     if ext_start >= 0 and ext_end <= data.shape[0]:
#         ext_data = data[ext_start:ext_end, :]
#         arr_ear_ev.append(ext_data.reshape(1, 1000, 3))
#         y_label_each_ev_ev.append(0)
#     if i % 100 == 0:
#             print(f"[EVAL] Micro: {i}/{len(s_num_mi_ev)} Crop processed")
# print("[EVAL] Micro processing done")

# # Macro
# for i, c in enumerate(s_num_ma_ev):
#     evi = ev_list_ma_ev[c]
#     dataset = dtfl["data"][evi]
#     data = np.array(dataset)

#     p_picking = dataset.attrs["p_arrival_sample"]
#     margin_sample = 300
#     ext_start = int(p_picking - margin_sample)
#     ext_end = ext_start + 1000

#     if ext_start >= 0 and ext_end <= data.shape[0]:
#         ext_data = data[ext_start:ext_end, :]
#         arr_ear_ev.append(ext_data.reshape(1, 1000, 3))
#         y_label_each_ev_ev.append(1)
#     if i % 100 == 0:
#             print(f"[EVAL] Macro: {i}/{len(s_num_ma_ev)} crop processed")
# print("[EVAL] Macro processing done")

# # Noise
# for i, c in enumerate(s_num_noi_ev):
#     evi = ev_list_noi_ev[c]
#     dataset = dtfl["data"][evi]
#     data = np.array(dataset)

#     ext_data = data[1000:2000, :]
#     arr_ear_ev.append(ext_data.reshape(1, 1000, 3))
#     y_label_each_ev_ev.append(2)
#     if i % 100 == 0:
#         print(f"[EVAL] Noise: {i}/{len(s_num_noi_ev)} Crop processed")
# print("[EVAL] Noise processing done")

# ENZ_arr_ear_ev = np.array(arr_ear_ev, dtype=float)
# ENZ_ylabel_each_ev_ev = np.array(y_label_each_ev_ev, dtype=int)
# print(f"Eval samples  : {len(ENZ_arr_ear_ev)}")
# print("Eval shape  :", ENZ_arr_ear_ev.shape)
# print("Eval labels:")
# unique, counts = np.unique(ENZ_ylabel_each_ev_ev, return_counts=True)
# print(dict(zip(unique, counts)))
# np.savez(
#     output_dir / "crop_ev.npz",
#     data=ENZ_arr_ear_ev,
#     label=ENZ_ylabel_each_ev_ev
# )


print("save done")
print('save done')

