// Minimal HTTP wrapper around go-invite-render.
// POST /render  — multipart: background (file) + zones (JSON) + fields (JSON)
// Returns the rendered PNG directly.
//
// Run:
//
//	go run main.go
//	curl -X POST http://localhost:8080/render \
//	  -F "background=@bg.jpg" \
//	  -F 'zones=[{"type":"text","text":"{{guest_name}}","xPct":50,"yPct":30,"fontSize":48,"color":"#fff","fontFamily":"Montserrat","align":"center","widthPct":80}]' \
//	  -F 'fields={"guest_name":"John Doe","event_name":"Wedding 2026"}' \
//	  --output card.png
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"

	inviterender "github.com/godopetza/go-invite-render"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	http.HandleFunc("/render", renderHandler)
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"ok":true}`))
	})

	log.Printf("listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func renderHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}

	if err := r.ParseMultipartForm(32 << 20); err != nil {
		http.Error(w, "parse form: "+err.Error(), http.StatusBadRequest)
		return
	}

	// background image
	f, _, err := r.FormFile("background")
	if err != nil {
		http.Error(w, "background file required", http.StatusBadRequest)
		return
	}
	defer f.Close()
	bgData, err := io.ReadAll(f)
	if err != nil {
		http.Error(w, "read background: "+err.Error(), http.StatusBadRequest)
		return
	}

	// zones JSON
	var zones []inviterender.Zone
	if err := json.Unmarshal([]byte(r.FormValue("zones")), &zones); err != nil {
		http.Error(w, "zones JSON invalid: "+err.Error(), http.StatusBadRequest)
		return
	}

	// fields JSON
	var fields map[string]string
	if raw := r.FormValue("fields"); raw != "" {
		if err := json.Unmarshal([]byte(raw), &fields); err != nil {
			http.Error(w, "fields JSON invalid: "+err.Error(), http.StatusBadRequest)
			return
		}
	}

	png, err := inviterender.RenderCard(bgData, zones, fields)
	if err != nil {
		http.Error(w, fmt.Sprintf("render: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Content-Disposition", `attachment; filename="card.png"`)
	w.Write(png)
}
