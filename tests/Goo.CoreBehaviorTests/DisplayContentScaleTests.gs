import Goo
import Xunit

class DisplayContentScaleTests {
  @Fact
  func WaylandAndMacOsScaleUsesFramebufferDensityWithoutDoubleScaling() {
    let content2x = DisplayScale.ResolveContentScale(1180, 780, 2360, 1560, 2.0F, 2.0F)
    let dpi2x = DisplayScale.DpiScale(1180, 780, 2360, 1560, 2.0F)
    let metrics2x = DisplayScale.ResolveWindowMetrics(1180, 780, 2360, 1560, 2.0F, 2.0F)

    Assert.Equal(1.0, content2x, 3)
    Assert.Equal(2.0F, dpi2x.X, 3)
    Assert.Equal(2.0, float64(dpi2x.X) * content2x, 3)
    Assert.Equal(2.0, metrics2x.DisplayScaleX, 3)
    Assert.Equal(2.0, metrics2x.DisplayScaleY, 3)

    let content15x = DisplayScale.ResolveContentScale(1000, 700, 1500, 1050, 1.5F, 1.5F)
    let metrics15x = DisplayScale.ResolveWindowMetrics(1000, 700, 1500, 1050, 1.5F, 1.5F)
    Assert.Equal(1.0, content15x, 3)
    Assert.Equal(1.5, metrics15x.DisplayScaleX, 3)
  }

  @Fact
  func WindowsAndX11PhysicalPixelHostsUseDisplayContentScale() {
    let content2x = DisplayScale.ResolveContentScale(2360, 1560, 2360, 1560, 2.0F, 1.0F)
    let dpi2x = DisplayScale.DpiScale(2360, 1560, 2360, 1560, 2.0F)
    let metrics2x = DisplayScale.ResolveWindowMetrics(2360, 1560, 2360, 1560, 2.0F, 1.0F)

    Assert.Equal(2.0, content2x, 3)
    Assert.Equal(1.0F, dpi2x.X, 3)
    Assert.Equal(2.0, float64(dpi2x.X) * content2x, 3)
    Assert.Equal(2.0, metrics2x.DisplayScaleX, 3)
    Assert.Equal(2.0, metrics2x.DisplayScaleY, 3)

    let content15x = DisplayScale.ResolveContentScale(1500, 1050, 1500, 1050, 1.5F, 1.0F)
    let metrics15x = DisplayScale.ResolveWindowMetrics(1500, 1050, 1500, 1050, 1.5F, 1.0F)
    Assert.Equal(1.5, content15x, 3)
    Assert.Equal(1.5, metrics15x.DisplayScaleX, 3)
  }

  @Fact
  func StandardAndEmbeddedHostsKeepUnitContentScaleAndAnisotropicMetrics() {
    Assert.Equal(1.0, DisplayScale.ResolveContentScale(1280, 720, 1280, 720, 1.0F, 1.0F), 3)
    Assert.Equal(1.0, DisplayScale.ResolveContentScale(100, 100, 200, 100, 0.0F, 0.0F), 3)

    let embedded = DisplayScale.ResolveWindowMetrics(100, 100, 200, 100, 0.0F, 0.0F)
    Assert.Equal(2.0, embedded.DisplayScaleX, 3)
    Assert.Equal(1.0, embedded.DisplayScaleY, 3)
  }
}
