import Goo
import System
import System.IO

internal class RenderCommandPage : Cell {
    private let appearance Context[Style]

    internal init(appearance Context[Style]) { this.appearance = appearance }

    override func Build() Blob {
        let style = appearance.TryRead(appearance.Window, out var configured) ? configured : Style{}
        return Container{
            FlexGrow: 1,
            Text{BasedOn: style, Content: "Registered font: WWW iii 0123"},
        }
    }
}

func RunRenderCommandSmoke() {
    using let font = FontSource.FromPath(
        "Render command font", 400, false, Path.Combine(AppContext.BaseDirectory, "VendSans-VariableFont_wght.ttf")
    )
    font.Register()
    let appearance = Context[Style]()
    let window = Window{
        Width: 320, Height: 96, Background: Color.Rgb(32, 64, 96),
        Root: RenderCommandPage(appearance),
        Scenes: System.Collections.Generic.Dictionary[string, Func[Cell]]{
            ["registered"] = () -> RenderCommandPage(appearance),
        },
    }
    appearance.Set(window, Style{FontFamily: "Render command font", FontSize: 20, Color: Color.White})
    Application.Run(window)
}
