import logging
import sys

def setup_logging():
    """Sets up the global logging configuration."""
    log_format = "%(asctime)s | %(levelname)-8s | %(name)s:%(lineno)d | %(message)s"
    
    # Configure root logger
    logging.basicConfig(
        level=logging.INFO,
        format=log_format,
        handlers=[
            logging.StreamHandler(sys.stdout)
        ]
    )
    
    # Optional: Add file handler if needed
    # file_handler = logging.FileHandler("app.log")
    # file_handler.setFormatter(logging.Formatter(log_format))
    # logging.getLogger().addHandler(file_handler)

    logging.info("Logging configured successfully.")

def get_logger(name: str):
    """Returns a logger instance with the given name."""
    return logging.getLogger(name)
