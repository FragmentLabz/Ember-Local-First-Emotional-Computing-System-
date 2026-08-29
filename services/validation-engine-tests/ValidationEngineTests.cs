// ember - a local-first encrypted journaling app.
// Copyright (C) 2026 Jeremiah Ayeni <https://github.com/Jeremy-1011>
//
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// This program is free software: you can redistribute it and/or modify it
// under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or (at your
// option) any later version.
//
// This program is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
// General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

public class ValidationEngineTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public ValidationEngineTests(WebApplicationFactory<Program> factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Health_ReturnsOk()
    {
        var res = await _client.GetAsync("/health");
        Assert.True(res.IsSuccessStatusCode);
    }

    [Fact]
    public async Task ValidateEntry_RejectsPastCapsuleUnlockDate()
    {
        var res = await _client.PostAsJsonAsync("/validate/entry", new
        {
            type = "capsule",
            capsule = new { unlockAt = DateTimeOffset.UtcNow.AddDays(-1).ToUnixTimeMilliseconds() },
        });
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(body.GetProperty("valid").GetBoolean());
    }

    [Fact]
    public async Task ValidateEntry_AcceptsFutureCapsuleUnlockDate()
    {
        var res = await _client.PostAsJsonAsync("/validate/entry", new
        {
            type = "capsule",
            capsule = new { unlockAt = DateTimeOffset.UtcNow.AddDays(1).ToUnixTimeMilliseconds() },
        });
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("valid").GetBoolean());
    }

    [Theory]
    [InlineData(0, "words", false)]
    [InlineData(3651, "words", false)]
    [InlineData(30, "sizzle", false)]
    [InlineData(30, "words", true)]
    [InlineData(1, "burn", true)]
    public async Task ValidateEntry_ChecksDecayBounds(int durationDays, string mode, bool expectedValid)
    {
        var res = await _client.PostAsJsonAsync("/validate/entry", new
        {
            type = "decay",
            decay = new { durationDays, mode },
        });
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(expectedValid, body.GetProperty("valid").GetBoolean());
    }

    [Fact]
    public async Task CanModify_LocksUntilFirstRevisit()
    {
        var res = await _client.PostAsJsonAsync("/validate/can-modify", new
        {
            type = "regular",
            priorRevisit = false,
        });
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(body.GetProperty("allowed").GetBoolean());
    }

    [Fact]
    public async Task CanModify_UnlocksRegularEntryAfterRevisit()
    {
        var res = await _client.PostAsJsonAsync("/validate/can-modify", new
        {
            type = "regular",
            priorRevisit = true,
        });
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("allowed").GetBoolean());
    }

    [Fact]
    public async Task CanModify_KeepsSealedCapsuleLockedBeforeUnlockDate()
    {
        var res = await _client.PostAsJsonAsync("/validate/can-modify", new
        {
            type = "capsule",
            priorRevisit = true,
            capsuleUnlockAt = DateTimeOffset.UtcNow.AddDays(1).ToUnixTimeMilliseconds(),
        });
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(body.GetProperty("allowed").GetBoolean());
    }

    [Fact]
    public async Task CanModify_UnlocksCapsuleAfterUnlockDate()
    {
        var res = await _client.PostAsJsonAsync("/validate/can-modify", new
        {
            type = "capsule",
            priorRevisit = true,
            capsuleUnlockAt = DateTimeOffset.UtcNow.AddDays(-1).ToUnixTimeMilliseconds(),
        });
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("allowed").GetBoolean());
    }
}
