"""The 2024 converters: the same names as ft_classes, so ft_notes can pick a module per library.

Classes and origins are separate files so each can be rebuilt on its own.
"""
from .. import ft_classes
from .classes import class_doc, class_feature, subclass_doc, subclass_feature
from .origins import background_doc, feat_doc, race_doc


def load(root, sources=None):
    return ft_classes.load(root, sources)
