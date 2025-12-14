document.addEventListener("DOMContentLoaded", () => {
    // Fetch roomId from the hidden input
    const roomId = document.getElementById("room-id").value;
    console.log("Room ID:", roomId);

    const socket = new WebSocket("ws://localhost:8000");

    socket.onopen = () => {
        console.log("Connected to the chatroom:", roomId);
    };

    socket.onmessage = (event) => {
        try {
            console.log("Message received:", event.data);
            const message = JSON.parse(event.data);

            const messageList = document.getElementById("message-list");
            if (!messageList) {
                console.error("Message list not found in DOM!");
                return;
            }

            const messageElem = document.createElement("div");
            messageElem.textContent = `${message.username}: ${message.text}`;
            messageList.appendChild(messageElem);
            messageList.scrollTop = messageList.scrollHeight; // Scroll to the latest message
        } catch (error) {
            console.error("Error parsing message:", error);
        }
    };

    socket.onerror = (error) => {
        console.error("WebSocket error:", error);
    };

    document.getElementById("send-message").addEventListener("click", () => {
        const input = document.getElementById("message-input");
        const text = input.value.trim();
        if (text) {
            const messageData = { roomId, text };
            console.log("Sending message:", messageData);

            socket.send(JSON.stringify(messageData));
            input.value = "";
        }
    });

    document.getElementById("message-input").addEventListener("keypress", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            const input = document.getElementById("message-input");
            const text = input.value.trim();
            if (text) {
                const messageData = { roomId, text };
                console.log("Sending message on Enter:", messageData);

                socket.send(JSON.stringify(messageData));
                input.value = "";
            }
        }
    });
});
