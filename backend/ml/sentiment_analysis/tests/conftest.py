import sys
from unittest.mock import MagicMock

if 'transformers' not in sys.modules:
    sys.modules['transformers'] = MagicMock()
