import importlib.util
from pathlib import Path
import unittest
import numpy as np

spec = importlib.util.spec_from_file_location('support', Path(__file__).with_name('floor-support-diagnostic.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
inspect = module.inspect_support


class SupportTests(unittest.TestCase):
    def grid(self):
        x, z = np.meshgrid(np.linspace(-1, 1, 41), np.linspace(-1, 1, 41))
        return np.column_stack([x.ravel(), np.zeros(x.size), z.ravel()])

    def test_dense_plane_is_interpolable_but_not_approved(self):
        result = inspect(self.grid(), [.023, .017])
        self.assertTrue(result['targetInterpolable'])
        self.assertFalse(result['collisionApproved'])

    def test_large_hole_is_not_bridged(self):
        p = self.grid()
        result = inspect(p[np.max(np.abs(p[:, [0, 2]]), axis=1) > .6], [0, 0])
        self.assertFalse(result['targetInterpolable'])

    def test_step_is_not_replaced_by_a_ramp(self):
        p = self.grid()
        p[p[:, 0] >= 0, 1] = .3
        self.assertFalse(inspect(p, [-.025, .017])['targetInterpolable'])

    def test_tabletop_cannot_be_certified_from_geometry(self):
        p = self.grid()
        p[:, 1] = .8
        result = inspect(p, [.023, .017])
        self.assertTrue(result['targetInterpolable'])
        self.assertFalse(result['collisionApproved'])

    def test_stacked_samples_reject(self):
        p = self.grid()
        upper = p.copy()
        upper[:, 1] = 3
        with self.assertRaises(ValueError):
            inspect(np.concatenate([p, upper]), [0, 0])

    def test_small_hole_is_an_explicit_ambiguity_not_approval(self):
        p = self.grid()
        result = inspect(p[np.max(np.abs(p[:, [0, 2]]), axis=1) > .06], [0, 0])
        self.assertTrue(result['targetInterpolable'])
        self.assertFalse(result['collisionApproved'])

    def test_target_diagnostics_explain_step_rejection(self):
        p = self.grid()
        p[p[:, 0] >= 0, 1] = .3
        result = inspect(p, [-.025, .017])
        self.assertLess(result['targetTriangleUpNormal'], .98)
        self.assertGreater(result['targetTriangleHeightSpan'], .08)


if __name__ == '__main__':
    unittest.main()
