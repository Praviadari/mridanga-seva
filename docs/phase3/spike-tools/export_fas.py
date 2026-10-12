# Exports the two Silent-Face-Anti-Spoofing models (Apache 2.0, minivision-ai) to ONNX with softmax
# appended. Input: 1x3x80x80 float, BGR, 0..255 (no scaling), output: 1x3 softmax, index 1 = real face.
import importlib.util, sys, os, torch
from collections import OrderedDict
src = sys.argv[1]; out = sys.argv[2]
spec = importlib.util.spec_from_file_location('minifasnet', os.path.join(src, 'src_model_lib_MiniFASNet.py'))
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
def kernel(h, w): return ((h + 15) // 16, (w + 15) // 16)
class WithSoftmax(torch.nn.Module):
    def __init__(self, m): super().__init__(); self.m = m
    def forward(self, x): return torch.softmax(self.m(x), dim=1)
for fname, ctor, name in [('2.7_80x80_MiniFASNetV2.pth', mod.MiniFASNetV2, 'minifasnet_v2_2_7'),
                          ('4_0_0_80x80_MiniFASNetV1SE.pth', mod.MiniFASNetV1SE, 'minifasnet_v1se_4_0')]:
    m = ctor(conv6_kernel=kernel(80, 80))
    sd = torch.load(os.path.join(src, fname), map_location='cpu', weights_only=True)
    sd = OrderedDict((k[7:] if k.startswith('module.') else k, v) for k, v in sd.items())
    m.load_state_dict(sd); m.eval()
    w = WithSoftmax(m).eval()
    x = torch.rand(1, 3, 80, 80) * 255
    torch.onnx.export(w, x, os.path.join(out, name + '.onnx'), input_names=['input'], output_names=['prob'],
                      opset_version=13, dynamo=False)
    print(name, w(x).detach().numpy())
