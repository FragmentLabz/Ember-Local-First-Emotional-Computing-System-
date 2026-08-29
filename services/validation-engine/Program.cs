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

// Ember's "Validation Engine" — emotional-state validation and time-lock
// enforcement, kept local-only (bound to 127.0.0.1, no external network).

using System.Text.Json;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.UseUrls("http://127.0.0.1:8901");

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
});

const string CorsPolicy = "ember-local";
builder.Services.AddCors(o => o.AddPolicy(CorsPolicy, p => p
    // Vite dev server, plus Electron's file:// pages (which send Origin: null).
    .WithOrigins("http://localhost:5173", "http://127.0.0.1:5173")
    .SetIsOriginAllowed(origin => origin == "null" || origin.StartsWith("http://localhost") || origin.StartsWith("http://127.0.0.1"))
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();
app.UseCors(CorsPolicy);

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

// Mirrors the bounds already implied by the write-view's HTML inputs
// (src/app.js renderCapsuleOptions/renderDecayOptions), made authoritative.
app.MapPost("/validate/entry", (ValidateEntryRequest req) =>
{
    var errors = new List<string>();
    var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    switch (req.Type)
    {
        case "capsule":
            if (req.Capsule is null)
            {
                errors.Add("A time capsule needs an unlock date.");
            }
            else if (req.Capsule.UnlockAt <= now)
            {
                errors.Add("The unlock date must be in the future.");
            }
            break;

        case "decay":
            if (req.Decay is null)
            {
                errors.Add("A decaying entry needs decay settings.");
            }
            else
            {
                if (req.Decay.DurationDays < 1 || req.Decay.DurationDays > 3650)
                    errors.Add("Decay duration must be between 1 and 3650 days.");
                if (req.Decay.Mode is not ("words" or "burn"))
                    errors.Add("Decay mode must be 'words' or 'burn'.");
            }
            break;

        case "regular":
            break;

        default:
            errors.Add($"Unknown entry type '{req.Type}'.");
            break;
    }

    return Results.Ok(new ValidateEntryResponse(errors.Count == 0, errors));
});

// A straight port of the time-lock gate that used to live in src/app.js
// (canModify): an entry can only be edited or deleted after a separate,
// later revisit — and a sealed capsule stays locked until its unlock date.
app.MapPost("/validate/can-modify", (CanModifyRequest req) =>
{
    if (!req.PriorRevisit)
        return Results.Ok(new CanModifyResponse(false));

    if (req.Type == "capsule")
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var allowed = req.CapsuleUnlockAt is not null && now >= req.CapsuleUnlockAt.Value;
        return Results.Ok(new CanModifyResponse(allowed));
    }

    return Results.Ok(new CanModifyResponse(true));
});

app.Run();

// Makes the top-level Program accessible to WebApplicationFactory<Program>
// in the test project.
public partial class Program { }

record CapsuleFields([property: JsonPropertyName("unlockAt")] long UnlockAt);
record DecayFields(
    [property: JsonPropertyName("durationDays")] int DurationDays,
    [property: JsonPropertyName("mode")] string Mode);

record ValidateEntryRequest(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("capsule")] CapsuleFields? Capsule,
    [property: JsonPropertyName("decay")] DecayFields? Decay);

record ValidateEntryResponse(bool Valid, List<string> Errors);

record CanModifyRequest(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("priorRevisit")] bool PriorRevisit,
    [property: JsonPropertyName("capsuleUnlockAt")] long? CapsuleUnlockAt);

record CanModifyResponse(bool Allowed);
