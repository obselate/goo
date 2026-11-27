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
  func RetireAndRecycleOversizedAtlasPagesKeepResidentBytesAccurate() -> Assert.True(
    VulkanTextAtlasScalingFixtures().RetireAndRecycleOversizedAtlasPagesKeepResidentBytesAccurate()
  )

  @Fact
  func GlyphExceedingMaxWorkspaceCapacityStillThrows() -> Assert.True(
    VulkanTextAtlasScalingFixtures().GlyphExceedingMaxWorkspaceCapacityStillThrows()
  )
}
