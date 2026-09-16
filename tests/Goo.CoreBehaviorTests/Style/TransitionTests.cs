using System;
using Goo;
using Xunit;

public class TransitionTests
{

    [Fact]
    public void PropertiesRoundTripExceptAll()
    {
        var tested = 0;
        foreach (var property in Enum.GetValues<TransitionProperty>())
        {
            if (property == TransitionProperty.All)
            {
                continue;
            }

            var roundTrip = new Container
            {
                TransitionProperties = new[] { property },
            }.TransitionProperties;

            Assert.Single(roundTrip);
            Assert.Equal(property, roundTrip[0]);
            tested++;
        }

        Assert.Equal(Enum.GetValues<TransitionProperty>().Length - 1, tested);
    }

}
