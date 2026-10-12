import tensorflow as tf, sys
for d, name in [('out_sface','sface'),('out_minifasnet_v2_2_7','minifasnet_v2_2_7'),('out_minifasnet_v1se_4_0','minifasnet_v1se_4_0')]:
    c = tf.lite.TFLiteConverter.from_saved_model(d)
    c.optimizations = [tf.lite.Optimize.DEFAULT]
    open(f'{name}_dynint8.tflite','wb').write(c.convert())
    print('ok', name)
