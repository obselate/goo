## Changed

- Text coverage now takes four uniform sub-pixel samples at every size instead of one sample between 11 and 24 ppem, so glyph corners, joins and diagonals match exact area coverage more closely. Light text on dark backgrounds gets the DirectWrite gamma 1.8 alpha correction that GPUI also uses, driven by the text colour's brightness, so its edges carry about 11 percent more ink. Dark text changes by under 4 percent.
