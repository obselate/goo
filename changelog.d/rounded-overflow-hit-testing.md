## Fixed

- Exclude descendants outside rounded corners from hit testing when both overflow axes clip. Hidden and Scroll overflow now use the same rounded box for normal pointer hits, diagnostic hits and hit chains. Visible overflow is unchanged.
