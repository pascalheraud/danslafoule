from app.core.rate_limit import check_rate_limit, reset_rate_limits


def setup_function() -> None:
    reset_rate_limits()


def test_allows_requests_under_the_limit() -> None:
    for _ in range(5):
        assert check_rate_limit("key", max_requests=5, window_seconds=60) is True


def test_blocks_requests_over_the_limit() -> None:
    for _ in range(3):
        check_rate_limit("key", max_requests=3, window_seconds=60)

    assert check_rate_limit("key", max_requests=3, window_seconds=60) is False


def test_different_keys_have_independent_limits() -> None:
    for _ in range(3):
        check_rate_limit("key-a", max_requests=3, window_seconds=60)

    assert check_rate_limit("key-b", max_requests=3, window_seconds=60) is True
