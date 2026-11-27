package WebView2Spike

import Goo

class ReferenceView : Cell {
    override func Build() Blob -> Container{
        Width: Percent(100),
        Height: Percent(100),
        BackgroundColor: SpikeTheme.Reference,
    }
}
