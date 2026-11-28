import Goo
import System.IO
import Xunit

class SystemFontResolverTests {
  @Fact
  func WindowsConsolaStemsResolveConsolasFamilyVariantsAndMonospaceAlias() {
    let segoeUi = Path.Combine("fonts", "segoeui.ttf")
    let regular = Path.Combine("fonts", "consola.ttf")
    let bold = Path.Combine("fonts", "consolab.ttf")
    let italic = Path.Combine("fonts", "consolai.ttf")
    let boldItalic = Path.Combine("fonts", "consolaz.ttf")
    let resolver = FileSystemFontResolver([]string{
      segoeUi,
      regular,
      bold,
      italic,
      boldItalic,
    })

    Assert.Equal(regular, resolver.Find("Consolas", 400, false))
    Assert.Equal(bold, resolver.Find("Consolas", 700, false))
    Assert.Equal(italic, resolver.Find("Consolas", 400, true))
    Assert.Equal(boldItalic, resolver.Find("Consolas", 700, true))
    Assert.Equal(regular, resolver.Find("monospace", 400, false))
  }
}
