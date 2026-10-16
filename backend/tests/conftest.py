import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def fresh_cache() -> None:
    """Provider caches and throttle counters live in the cache; start every test empty."""
    cache.clear()
