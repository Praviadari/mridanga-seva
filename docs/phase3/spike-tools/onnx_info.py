import onnx, sys
m = onnx.load(sys.argv[1])
for i in m.graph.input: print('in', i.name, [d.dim_value or d.dim_param for d in i.type.tensor_type.shape.dim])
for o in m.graph.output: print('out', o.name, [d.dim_value or d.dim_param for d in o.type.tensor_type.shape.dim])
print('opset', [(o.domain, o.version) for o in m.opset_import])
from collections import Counter
print(Counter(n.op_type for n in m.graph.node))
