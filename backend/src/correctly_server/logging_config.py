import logging
from logging.handlers import RotatingFileHandler


def configure(directory):
    directory.mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(directory / "server.log", maxBytes=128 * 1024,
                                  backupCount=2, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger = logging.getLogger("correctly")
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)
    logger.propagate = False
    return handler
