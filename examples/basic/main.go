package main

import (
	"encoding/json"
	"fmt"
	"os"

	inviterender "github.com/godopetza/go-invite-render"
)

func main() {
	// Load background image
	bg, err := os.ReadFile("background.jpg")
	if err != nil {
		fmt.Fprintln(os.Stderr, "background.jpg not found — provide any JPEG/PNG as background.jpg")
		os.Exit(1)
	}

	// Define zones (or load from a JSON file)
	zones := []inviterender.Zone{
		{
			ID:   "event",
			Type: "text",
			Text: "{{event_name}}",
			XPct: 50, YPct: 22,
			FontFamily: "CormorantGaramond",
			FontSize:   52,
			Color:      "#FFFFFF",
			Bold:       true,
			Align:      "center",
			WidthPct:   80,
			Opacity:    1.0,
		},
		{
			ID:   "guest",
			Type: "text",
			Text: "{{guest_name}}",
			XPct: 50, YPct: 38,
			FontFamily: "GreatVibes",
			FontSize:   64,
			Color:      "#F5E6C8",
			Align:      "center",
			WidthPct:   80,
			Opacity:    1.0,
		},
		{
			ID:   "date",
			Type: "text",
			Text: "{{event_date}}  •  {{venue}}",
			XPct: 50, YPct: 52,
			FontFamily: "Montserrat",
			FontSize:   22,
			Color:      "#FFFFFFCC",
			Align:      "center",
			WidthPct:   75,
			Opacity:    0.9,
		},
		// QR zone — rendered only when __checkin_token__ is in the field map
		inviterender.DefaultQRZone(),
	}

	fields := map[string]string{
		"guest_name":        "Amina Hassan",
		"event_name":        "Harusi ya John & Mary",
		"event_date":        "14 June 2026",
		"venue":             "Mlimani City Hall, Dar es Salaam",
		"__checkin_token__": "https://check.in/guest/abc123", // omit to skip QR
	}

	png, err := inviterender.RenderCard(bg, zones, fields)
	if err != nil {
		fmt.Fprintln(os.Stderr, "render failed:", err)
		os.Exit(1)
	}

	if err := os.WriteFile("card.png", png, 0644); err != nil {
		fmt.Fprintln(os.Stderr, "write failed:", err)
		os.Exit(1)
	}
	fmt.Println("card.png written —", len(png)/1024, "KB")

	// You can also load zones from JSON:
	_ = json.Marshal // import kept for reference
}
