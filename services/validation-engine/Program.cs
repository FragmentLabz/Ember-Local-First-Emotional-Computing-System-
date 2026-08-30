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

// Ember's "Validation Engine". It checks entry settings and enforces the
// time lock. It is bound to 127.0.0.1 only, so nothing here is reachable from
// outside this machine.

using System.Text.Json;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.UseUrls("http://127.0.0.1:8901");

// Send JSON back with camelCase names, which is what the JavaScript expects.
builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
});

const string CorsPolicy = "ember-local";

builder.Services.AddCors(o => o.AddPolicy(CorsPolicy, p => p
    // The Vite dev server, plus Electron's file:// pages, which send "null".
    .WithOrigins("http://localhost:5173", "http://127.0.0.1:5173")
    .SetIsOriginAllowed(origin =>
        origin == "null"
        || origin.StartsWith("http://localhost")
        || origin.StartsWith("http://127.0.0.1"))
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();
app.UseCors(CorsPolicy);

// Used by the app at startup to check this service is running.
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

// Checks an entry's settings before it is saved. This repeats the limits the
// write form already shows (see renderCapsuleOptions and renderDecayOptions in
// src/app.js), but here they are the ones that actually count.
app.MapPost("/validate/entry", (ValidateEntryRequest req) =>
{
    var errors = new List<string>();
    var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    if (req.Type == "capsule")
    {
        if (req.Capsule == null)
        {
            errors.Add("A time capsule needs an unlock date.");
        }
        else if (req.Capsule.UnlockAt <= now)
        {
            errors.Add("The unlock date must be in the future.");
        }
    }
    else if (req.Type == "decay")
    {
        if (req.Decay == null)
        {
            errors.Add("A decaying entry needs decay settings.");
        }
        else
        {
            if (req.Decay.DurationDays < 1 || req.Decay.DurationDays > 3650)
            {
                errors.Add("Decay duration must be between 1 and 3650 days.");
            }

            if (req.Decay.Mode != "words" && req.Decay.Mode != "burn")
            {
                errors.Add("Decay mode must be 'words' or 'burn'.");
            }
        }
    }
    else if (req.Type != "regular")
    {
        errors.Add($"Unknown entry type '{req.Type}'.");
    }

    var response = new ValidateEntryResponse
    {
        Valid = errors.Count == 0,
        Errors = errors
    };

    return Results.Ok(response);
});

// The time-lock gate, moved here from src/app.js. An entry can only be edited
// or deleted after a separate, later revisit, and a sealed capsule stays
// locked until its unlock date has passed.
app.MapPost("/validate/can-modify", (CanModifyRequest req) =>
{
    // Never on the first visit, whatever the entry type.
    if (!req.PriorRevisit)
    {
        return Results.Ok(new CanModifyResponse { Allowed = false });
    }

    if (req.Type == "capsule")
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var unlocked = req.CapsuleUnlockAt != null && now >= req.CapsuleUnlockAt.Value;
        return Results.Ok(new CanModifyResponse { Allowed = unlocked });
    }

    return Results.Ok(new CanModifyResponse { Allowed = true });
});

app.Run();

// Lets the test project reach the top-level Program with
// WebApplicationFactory<Program>.
public partial class Program { }

// --- Request and response shapes -------------------------------------------
// The JsonPropertyName attributes match the names the JavaScript sends.

public class CapsuleFields
{
    [JsonPropertyName("unlockAt")]
    public long UnlockAt { get; set; }
}

public class DecayFields
{
    [JsonPropertyName("durationDays")]
    public int DurationDays { get; set; }

    [JsonPropertyName("mode")]
    public string Mode { get; set; } = "";
}

public class ValidateEntryRequest
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = "";

    [JsonPropertyName("capsule")]
    public CapsuleFields? Capsule { get; set; }

    [JsonPropertyName("decay")]
    public DecayFields? Decay { get; set; }
}

public class ValidateEntryResponse
{
    public bool Valid { get; set; }
    public List<string> Errors { get; set; } = new List<string>();
}

public class CanModifyRequest
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = "";

    [JsonPropertyName("priorRevisit")]
    public bool PriorRevisit { get; set; }

    [JsonPropertyName("capsuleUnlockAt")]
    public long? CapsuleUnlockAt { get; set; }
}

public class CanModifyResponse
{
    public bool Allowed { get; set; }
}
