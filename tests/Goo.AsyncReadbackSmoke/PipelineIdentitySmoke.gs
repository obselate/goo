package GooAsyncReadbackSmoke

import Goo
import System
import System.Collections.Generic
import System.IO
import System.Numerics
import System.Text

class PipelineIdentityCell : Cell {
  private let first ShaderEffect
  private let second ShaderEffect

  shared {
    let First ElementHandle = ElementHandle{}
    let Second ElementHandle = ElementHandle{}
  }

  init(firstEffect ShaderEffect, secondEffect ShaderEffect) {
    first = firstEffect
    second = secondEffect
  }

  override func Build() Blob -> Container() {.Width: Length.Percent(100),.Height: Length.Percent(100),.Position: PositionType.Relative,.BackgroundColor: Color.Rgb(12, 20, 32),
    Container{
        Handle: PipelineIdentityCell.First,
        Position: PositionType.Absolute,
        Left: 16,
        Top: 24,
        Width: 72,
        Height: 72,
        BackgroundColor: Color.White,
        ShaderEffect: first,
      },
      Container{
        Handle: PipelineIdentityCell.Second,
        Position: PositionType.Absolute,
        Left: 104,
        Top: 24,
        Width: 72,
        Height: 72,
        BackgroundColor: Color.White,
        ShaderEffect: second,
    },
  }
}

func PipelineIdentityClone(source []uint8) []uint8 {
  let clone = [source.Length]uint8
  Array.Copy(source, clone, source.Length)
  return clone
}

func PipelineIdentityModifyDebugName(source []uint8) []uint8 {
  let clone = PipelineIdentityClone(source)
  let marker = Encoding.ASCII.GetBytes("entryPointParam_main.color")
  var offset int32
  while offset <= clone.Length - marker.Length {
    var matched = true
    var index int32
    while index < marker.Length && matched {
      matched = clone[offset + index] == marker[index]
      index++
    }
    if matched {
      clone[offset] = uint8('f')
      return clone
    }
    offset++
  }
  throw InvalidOperationException("Pipeline identity fixture could not find a SPIR-V debug name")
}

func PipelineIdentityRemoveVulkanArtifact(source []uint8) []uint8 {
  let clone = PipelineIdentityClone(source)
  Require(clone.Length >= 16, "Pipeline identity bundle is truncated")
  clone[12] = uint8('T')
  clone[13] = uint8('E')
  clone[14] = uint8('S')
  clone[15] = uint8('T')
  return clone
}

func PipelineIdentityNear(first []uint8, second []uint8, tolerance int32) bool {
  var index int32
  while index < 4 {
    if Math.Abs(int32(first[index]) - int32(second[index])) > tolerance {
      return false
    }
    index++
  }
  return true
}

func RunPipelineIdentitySmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let shaderPath = Path.Combine(AppContext.BaseDirectory, "control_effect.frag.goo-effect")
  Require(File.Exists(shaderPath), "Pipeline identity shader effect asset is missing")
  let bundle = File.ReadAllBytes(shaderPath)
  let firstProgram = ShaderEffectProgram(PipelineIdentityClone(bundle))
  let secondProgram = ShaderEffectProgram(PipelineIdentityClone(bundle))
  let first = ShaderEffect(firstProgram, true)
  let second = ShaderEffect(secondProgram, true)
  first.SetParameter(0, Vector4(1.0F, 0.15F, 0.15F, 0.0F))
  second.SetParameter(0, Vector4(0.15F, 1.0F, 0.15F, 0.0F))
  let firstData = ShaderEffectData(BitConverter.GetBytes(1.0F))
  let secondData = ShaderEffectData(BitConverter.GetBytes(1.0F))
  let capturedError = StringWriter()
  let originalError = Console.Error
  first.SetData(0, firstData)
  second.SetData(0, secondData)
  Require(WindowReadbackTestFixture.ShaderEffectProgramId(first)
    != WindowReadbackTestFixture.ShaderEffectProgramId(second),
    "Separately loaded identical shader programs reused ProgramId")

  let window = Window{
    Title: "Goo pipeline identity",
    Width: 192,
    Height: 120,
    VSync: false,
    Root: PipelineIdentityCell(first, second),
    Background: Color.Transparent,
  }
  try {
    Console.SetError(capturedError)
    window.Open()
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    WindowReadbackTestFixture.ForceRender(window, 0.0166666666666667)
    let metrics = WindowReadbackTestFixture.Metrics(window)
    let firstBounds = PipelineIdentityCell.First.BorderBox
    let secondBounds = PipelineIdentityCell.Second.BorderBox
    let initial = PrimitiveReadback(window, metrics)
    let firstPixel = PrimitiveLogicalPixel(initial.Pixels, initial.Width, metrics,
      firstBounds.X + firstBounds.Width * 0.5, firstBounds.Y + firstBounds.Height * 0.5)
    let secondPixel = PrimitiveLogicalPixel(initial.Pixels, initial.Width, metrics,
      secondBounds.X + secondBounds.Width * 0.5, secondBounds.Y + secondBounds.Height * 0.5)
    Require(int32(firstPixel[0]) > int32(firstPixel[1]) + 120
        && int32(secondPixel[1]) > int32(secondPixel[0]) + 120,
      "Independent shader effect parameters did not produce distinct output")

    first.SetParameter(0, Vector4(0.15F, 0.15F, 1.0F, 0.0F))
    WindowReadbackTestFixture.ForceRender(window, 0.0166666666666667)
    let parameterFrame = PrimitiveReadback(window, metrics)
    let parameterFirst = PrimitiveLogicalPixel(parameterFrame.Pixels,
      parameterFrame.Width, metrics,
      firstBounds.X + firstBounds.Width * 0.5, firstBounds.Y + firstBounds.Height * 0.5)
    let parameterSecond = PrimitiveLogicalPixel(parameterFrame.Pixels,
      parameterFrame.Width, metrics,
      secondBounds.X + secondBounds.Width * 0.5, secondBounds.Y + secondBounds.Height * 0.5)
    Require(int32(parameterFirst[2]) > int32(parameterFirst[0]) + 120
        && PipelineIdentityNear(secondPixel, parameterSecond, 3),
      "Mutating one shared-pipeline effect parameter changed the other effect")
    firstData.Publish(BitConverter.GetBytes(0.5F))
    WindowReadbackTestFixture.ForceRender(window, 0.0166666666666667)
    let dataFrame = PrimitiveReadback(window, metrics)
    let dataFirst = PrimitiveLogicalPixel(dataFrame.Pixels, dataFrame.Width, metrics,
      firstBounds.X + firstBounds.Width * 0.5, firstBounds.Y + firstBounds.Height * 0.5)
    let dataSecond = PrimitiveLogicalPixel(dataFrame.Pixels, dataFrame.Width, metrics,
      secondBounds.X + secondBounds.Width * 0.5, secondBounds.Y + secondBounds.Height * 0.5)
    Require(int32(parameterFirst[2]) > int32(dataFirst[2]) + 50
        && int32(dataFirst[2]) > int32(dataFirst[0]) + 40
        && PipelineIdentityNear(secondPixel, dataSecond, 3),
      "Mutating one shared-pipeline effect data did not stay independent: parameter="
      +PrimitivePixelText(parameterFirst) + " data=" + PrimitivePixelText(dataFirst)
      +" second_before=" + PrimitivePixelText(secondPixel)
      +" second_after=" + PrimitivePixelText(dataSecond))

    let identical = List[ShaderEffect](64)
    var loadIndex int32
    while loadIndex < 64 {
      identical.Add(ShaderEffect(ShaderEffectProgram(PipelineIdentityClone(bundle)), true))
      loadIndex++
    }
    let identity = WindowReadbackTestFixture.ResolvePipelineIdentity(window,
      identical.ToArray(), first)
    Require(identity.EntryCount == 1 && identity.UniquePipelineCount == 1
        && identity.FirstPipeline != 0uL && identity.AllHandlesEqual
        && identity.SameObjectStable,
      "Identical shader bundles did not resolve to one stable native pipeline")

    let modifiedBundle = PipelineIdentityModifyDebugName(bundle)
    let modifiedProgram = ShaderEffectProgram(modifiedBundle)
    let modifiedEffect = ShaderEffect(modifiedProgram, true)
    let modifiedPipeline = WindowReadbackTestFixture.ResolveShaderEffectPipeline(
      window, modifiedEffect)
    Require(modifiedPipeline != identity.FirstPipeline
        && WindowReadbackTestFixture.ShaderEffectPipelineEntryCount(window) == 2,
      "Byte-distinct valid SPIR-V reused an existing native pipeline")
    Require(WindowReadbackTestFixture.VerifyShaderEffectDigestCollision(window,
      ShaderEffectProgram(PipelineIdentityClone(bundle)),
      ShaderEffectProgram(PipelineIdentityClone(modifiedBundle))),
      "Shader pipeline digest collision did not preserve exact-byte identity")

    let unsupportedProgram = ShaderEffectProgram(PipelineIdentityRemoveVulkanArtifact(bundle))
    let unsupportedEffect = ShaderEffect(unsupportedProgram, true)
    Require(WindowReadbackTestFixture.RejectShaderEffectWithoutVulkanArtifact(
      window, unsupportedEffect),
      "Shader effect without Vulkan artifact failed outside native artifact use")

    let beforeRecreatePipeline = WindowReadbackTestFixture.ResolveShaderEffectPipeline(window, first)
    Require(beforeRecreatePipeline != 0uL, "Pipeline identity fixture did not resolve a live pipeline")
    window.RequestClose()
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    Require(!window.IsOpen && WindowReadbackTestFixture.ResidentResourceBytes(window) == 0uL,
      "Pipeline identity fixture retained resources after first close")
    ReadbackValidateCommonDiagnostics(capturedError.ToString())

    first.SetParameter(0, Vector4(1.0F, 0.15F, 0.15F, 0.0F))
    let reopened = Window{
      Title: "Goo pipeline identity recreation",
      Width: 192,
      Height: 120,
      VSync: false,
      Root: PipelineIdentityCell(first, second),
      Background: Color.Transparent,
    }
    try {
      reopened.Open()
      WindowReadbackTestFixture.ForceRender(reopened, 0.0)
      WindowReadbackTestFixture.ForceRender(reopened, 0.0166666666666667)
      let recreatedPipeline = WindowReadbackTestFixture.ResolveShaderEffectPipeline(reopened, first)
      Require(recreatedPipeline != 0uL
          && WindowReadbackTestFixture.ShaderEffectPipelineEntryCount(reopened) == 1,
        "Runtime recreation did not rebuild one deduplicated shader pipeline")
      let recreatedMetrics = WindowReadbackTestFixture.Metrics(reopened)
      let recreated = PrimitiveReadback(reopened, recreatedMetrics)
      let recreatedFirst = PrimitiveLogicalPixel(recreated.Pixels, recreated.Width,
        recreatedMetrics, firstBounds.X + firstBounds.Width * 0.5,
        firstBounds.Y + firstBounds.Height * 0.5)
      let recreatedSecond = PrimitiveLogicalPixel(recreated.Pixels, recreated.Width,
        recreatedMetrics, secondBounds.X + secondBounds.Width * 0.5,
        secondBounds.Y + secondBounds.Height * 0.5)
      Require(int32(recreatedFirst[0]) > int32(recreatedFirst[1]) + 60
          && PipelineIdentityNear(secondPixel, recreatedSecond, 3),
        "Deduplicated shader pipeline output did not survive runtime recreation")
      reopened.RequestClose()
      WindowReadbackTestFixture.ForceRender(reopened, 0.0)
      Require(!reopened.IsOpen
          && WindowReadbackTestFixture.ResidentResourceBytes(reopened) == 0uL,
        "Pipeline identity fixture retained resources after recreated close")
    } finally {
      if reopened.IsOpen {
        reopened.RequestClose()
        WindowReadbackTestFixture.ForceRender(reopened, 0.0)
      }
    }
  } finally {
    Console.SetError(originalError)
    if window.IsOpen {
      window.RequestClose()
      WindowReadbackTestFixture.ForceRender(window, 0.0)
    }
    firstData.Dispose()
    secondData.Dispose()
  }
  ReadbackValidateCommonDiagnostics(capturedError.ToString())
  Console.WriteLine("pipeline-identity: loads=64 unique=1 distinct=1 collision=1 parameters=independent data=independent recreate=1 close=1")
}
