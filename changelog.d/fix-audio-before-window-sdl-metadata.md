## Fixed

- Apply desktop application metadata before audio or other SDL subsystems start, including direct SDL consumers, and release SDL after the last subsystem closes.
