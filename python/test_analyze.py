import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


class AnalyzerTest(unittest.TestCase):
    def test_contract_and_calls(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sample = root / "sample.py"
            sample.write_text(
                "def double(value: int) -> int:\n"
                "    return value * 2\n\n"
                "def calculate(input: int, offset: int = 1) -> int:\n"
                "    return double(input) + offset\n\n"
                "def endpoint() -> int:\n"
                "    return calculate(4)\n",
                encoding="utf-8",
            )
            analyzer = Path(__file__).with_name("analyze.py")
            process = subprocess.run(
                [sys.executable, str(analyzer), "--file", str(sample), "--line", "4", "--root", str(root), "--depth", "2"],
                check=True,
                capture_output=True,
                text=True,
            )
            flow = json.loads(process.stdout)
            self.assertEqual(flow["name"], "calculate")
            self.assertEqual(flow["returnType"], "int")
            self.assertEqual([item["name"] for item in flow["parameters"]], ["input", "offset"])
            self.assertEqual(flow["parameters"][1]["defaultValue"], "1")
            self.assertTrue(any(call["name"] == "double" for call in flow["outgoing"]))
            self.assertTrue(any(call["name"] == "endpoint" for call in flow["incoming"]))


if __name__ == "__main__":
    unittest.main()
