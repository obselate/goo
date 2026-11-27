import Goo
import Xunit

class VulkanTextAtlasScalingTests {
  @Fact
  func OversizedColorGlyphGrowsWorkspaceAndAtlasPage() -> Assert.True(
    VulkanTextAtlasScalingFixtures().OversizedColorGlyphGrowsWorkspaceAndAtlasPage()
  )

  @Fact
  func OversizedOutlineGlyphGrowsWorkspaceAndAtlasPage() -> Assert.True(
    VulkanTextAtlasScalingFixtures().OversizedOutlineGlyphGrowsWorkspaceAndAtlasPage()
  )

  @Fact
  func ColorGlyphGrowsEffectWorkspaceWithoutGrowingAtlasPage() -> Assert.True(
    VulkanTextAtlasScalingFixtures().ColorGlyphGrowsEffectWorkspaceWithoutGrowingAtlasPage()
  )

  @Fact
  func RetireOversizedAtlasPageKeepsResidentBytesAccurate() -> Assert.True(
    VulkanTextAtlasScalingFixtures().RetireOversizedAtlasPageKeepsResidentBytesAccurate()
  )

  @Fact
  func GlyphExceedingMaxWorkspaceCapacityStillThrows() -> Assert.True(
    VulkanTextAtlasScalingFixtures().GlyphExceedingMaxWorkspaceCapacityStillThrows()
  )
}
