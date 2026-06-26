from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

# Global flag
capture_requested = False


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/trigger", methods=["POST"])
def trigger():
    global capture_requested

    capture_requested = True

    print("📸 Capture requested by ESP32")

    return jsonify({
        "status": "ok"
    })


@app.route("/should_capture", methods=["GET"])
def should_capture():
    global capture_requested

    if capture_requested:
        capture_requested = False

        print("📱 Phone is capturing image")

        return jsonify({
            "capture": True
        })

    return jsonify({
        "capture": False
    })


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )