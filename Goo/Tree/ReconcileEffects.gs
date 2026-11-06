package Goo

import System

@Flags
internal enum ReconcileEffects {
  None = 0;
  Structure = 1;
  Style = 2;
  Content = 4;
  Layout = 8;
  Paint = 16;
  Input = 32;
  Rect = 64;
  Accessibility = 128;
  ScrollPlacement = 256;
}
