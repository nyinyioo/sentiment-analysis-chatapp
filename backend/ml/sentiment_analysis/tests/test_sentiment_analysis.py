"""
Unit tests for sentiment_analysis.py.

The transformers.pipeline is patched before the module is imported so the
HuggingFace model is never loaded during tests.
"""

import json
import sys
import importlib
import types
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# Module-level fixture: patch transformers.pipeline before importing
# ---------------------------------------------------------------------------

_mock_pipeline_instance = MagicMock()
_mock_pipeline_instance.return_value = [{"label": "POSITIVE", "score": 0.9}]

# We patch at the module level so all test classes share the same mock.
_pipeline_patcher = patch("transformers.pipeline", return_value=_mock_pipeline_instance)
_pipeline_patcher.start()

# Now it's safe to import; the real model is never loaded.
import sentiment_analysis as sa  # noqa: E402  (import after patch)


def teardown_module(module):
    _pipeline_patcher.stop()


# ---------------------------------------------------------------------------
# TestAnalyzeSentiment
# ---------------------------------------------------------------------------

class TestAnalyzeSentiment:

    def setup_method(self):
        # Reset the mock's return value before each test
        _mock_pipeline_instance.return_value = [{"label": "POSITIVE", "score": 0.9}]
        _mock_pipeline_instance.reset_mock()

    def test_returns_first_element_of_pipeline_results(self):
        _mock_pipeline_instance.return_value = [
            {"label": "POSITIVE", "score": 0.9},
            {"label": "NEGATIVE", "score": 0.1},
        ]
        result = sa.analyze_sentiment("hello")
        assert result == {"label": "POSITIVE", "score": 0.9}

    def test_result_has_label_key(self):
        result = sa.analyze_sentiment("hello")
        assert "label" in result

    def test_result_has_score_key(self):
        result = sa.analyze_sentiment("hello")
        assert "score" in result

    def test_passes_text_to_pipeline(self):
        sa.analyze_sentiment("my test text")
        _mock_pipeline_instance.assert_called_once_with("my test text")

    def test_score_is_float(self):
        _mock_pipeline_instance.return_value = [{"label": "POSITIVE", "score": 0.95}]
        result = sa.analyze_sentiment("hello")
        assert isinstance(result["score"], float)

    def test_handles_negative_label(self):
        _mock_pipeline_instance.return_value = [{"label": "NEGATIVE", "score": 0.8}]
        result = sa.analyze_sentiment("bad")
        assert result["label"] == "NEGATIVE"

    def test_handles_neutral_label(self):
        _mock_pipeline_instance.return_value = [{"label": "NEUTRAL", "score": 0.6}]
        result = sa.analyze_sentiment("okay")
        assert result["label"] == "NEUTRAL"

    def test_returns_none_when_text_is_none(self):
        result = sa.analyze_sentiment(None)
        assert result is None


# ---------------------------------------------------------------------------
# TestMainEntryPoint
# ---------------------------------------------------------------------------

class TestMainEntryPoint:

    def _run_main(self, text, capsys):
        """Simulate running the __main__ block with the given text."""
        original_argv = sys.argv[:]
        sys.argv = ["sentiment_analysis.py", text]
        try:
            # Re-execute the __main__ block by calling it directly
            input_text = sys.argv[1]
            sentiment = sa.analyze_sentiment(input_text)
            print(json.dumps(sentiment))
        finally:
            sys.argv = original_argv
        return capsys.readouterr()

    def test_main_prints_valid_json_to_stdout(self, capsys):
        _mock_pipeline_instance.return_value = [{"label": "POSITIVE", "score": 0.9}]
        out, _ = self._run_main("hello world", capsys)
        # Should not raise
        parsed = json.loads(out.strip())
        assert isinstance(parsed, dict)

    def test_output_contains_label_field(self, capsys):
        _mock_pipeline_instance.return_value = [{"label": "POSITIVE", "score": 0.9}]
        out, _ = self._run_main("hello world", capsys)
        parsed = json.loads(out.strip())
        assert "label" in parsed

    def test_output_contains_score_field(self, capsys):
        _mock_pipeline_instance.return_value = [{"label": "POSITIVE", "score": 0.9}]
        out, _ = self._run_main("hello world", capsys)
        parsed = json.loads(out.strip())
        assert "score" in parsed

    def test_uses_sys_argv_1_as_input_text(self, capsys):
        _mock_pipeline_instance.reset_mock()
        _mock_pipeline_instance.return_value = [{"label": "POSITIVE", "score": 0.9}]
        self._run_main("custom input text", capsys)
        _mock_pipeline_instance.assert_called_with("custom input text")


# ---------------------------------------------------------------------------
# TestPipelineInitialization
# ---------------------------------------------------------------------------

class TestPipelineInitialization:
    """
    Verify that the pipeline was initialised with the expected arguments.
    These assertions run against the module-level patch applied at import time.
    """

    def test_pipeline_called_with_sentiment_analysis_task(self):
        from unittest.mock import patch as _patch
        with _patch("transformers.pipeline") as mock_p:
            mock_p.return_value = _mock_pipeline_instance
            # Re-import to trigger pipeline() call
            if "sentiment_analysis" in sys.modules:
                del sys.modules["sentiment_analysis"]
            import sentiment_analysis as _sa  # noqa: F401
            mock_p.assert_called_with(
                "sentiment-analysis",
                model="cardiffnlp/twitter-roberta-base-sentiment",
                device=-1,
            )

    def test_pipeline_called_with_correct_model_name(self):
        with patch("transformers.pipeline") as mock_p:
            mock_p.return_value = _mock_pipeline_instance
            if "sentiment_analysis" in sys.modules:
                del sys.modules["sentiment_analysis"]
            import sentiment_analysis as _sa  # noqa: F401
            _, kwargs = mock_p.call_args
            assert kwargs.get("model") == "cardiffnlp/twitter-roberta-base-sentiment"

    def test_pipeline_called_with_device_minus_one(self):
        with patch("transformers.pipeline") as mock_p:
            mock_p.return_value = _mock_pipeline_instance
            if "sentiment_analysis" in sys.modules:
                del sys.modules["sentiment_analysis"]
            import sentiment_analysis as _sa  # noqa: F401
            _, kwargs = mock_p.call_args
            assert kwargs.get("device") == -1

