//helper functions given in the assignment-----------------------------------------------------------------
// Removes the contents of the given DOM element (equivalent to elem.innerHTML = '' but faster)
function emptyDOM (elem){
    while (elem.firstChild) elem.removeChild(elem.firstChild);
}

// Creates a DOM element from the given HTML string
function createDOM (htmlString){
    let template = document.createElement('template');
    template.innerHTML = htmlString.trim();
    return template.content.firstChild;
}

//global variable profile
let profile = {};


//define array Service and add origin property
const Service = {};
Service.origin = window.location.origin;

//service obj, getAllRooms function
//ret promise that resolves to JSON response data
Service.getAllRooms = function() {
    //makes a request to Service.origin + "/chat" URL
    return new Promise((resolve, reject) => {
        const XML = new XMLHttpRequest();
        //no '#' *** server side endpoint
        XML.open('GET', `${Service.origin}/lobby/chat`);

        XML.onload = function() {
            if (XML.status !== 200) {
                reject(new Error(XML.responseText));
            }

            try {
                resolve(JSON.parse(XML.responseText));
            } catch (error) {
                reject(new Error(error));
            }
        };
        //client side error, promise should reject
        XML.onerror = function() {
            reject(new Error('Client recieved an Error'))
        };

        XML.send();
    });
};

//define a function named addRoom, args (data)
//note data: array with 2 fields {name and image}

Service.addRoom = function(data){
    //makes a post request to Service.origin + "/chat" endpoint, with payload (data)
    return new Promise((resolve, reject) => {
        const XML = new XMLHttpRequest();
        XML.open('POST', `${Service.origin}/lobby/chat`); // Updated path
        //content type is set to application/json
        XML.setRequestHeader('Content-Type', 'application/json');
        //note: onject -> JSON string
        XML.onload = function() {
            if (XML.status === 200) {
                try {
                    resolve(JSON.parse(XML.responseText));
                } catch (error) {
                    reject(new Error(error));
                }
            } else {
                reject(new Error(XML.responseText));
            }
        };

        XML.onerror = function() {
            reject(new Error('Failed to add room'));
        }
        
        XML.send(JSON.stringify(data));
    });
}


// getLastConversation func for service object, accepts roomId and before, return proise conversation obj 
Service.getLastConversation = function(roomId, before = Date.now()) {
    const url = `${this.origin}/lobby/chat/${roomId}/messages?before=${before}`; // Updated path
    return fetch(url)
        .then(response => {
            if (!response.ok) {throw new Error('getLastConvo not ok');}
            return response.json();
        });
};

Service.getProfile = function() {
    return fetch('/profile')
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to fetch profile');
        }
        return response.json();
    })
    .catch(error => {
        console.error('Error fetching profile:', error);
        throw error;
    });

};

//create classes named Lobbyview, ChatView, and ProfileView
class LobbyView{
    constructor(lobby){
        this.lobby = lobby;
        this.elem = createDOM(`<div class = "content">
        <ul class = "room-list"></ul>
        <br>
        <br>
        <div class="page-control">
          <input type="text" placeholder="Room Title">
          <button>Create Room</button>
        </div>
        </div>`);

        this.listElem = this.elem.querySelector('.room-list');
        this.inputElem = this.elem.querySelector('input[type="text"]');
        this.buttonElem = this.elem.querySelector('button');
        
        //call Service.addRoom func when Create Room button is clicked
        //now calls service.addRoom 
        //when server ret with error, then we call this.lobby.addRoom
        this.buttonElem.addEventListener('click', () => {
            const roomData = { name: this.inputElem.value };
            Service.addRoom(roomData)
            .then(newRoom => {
                this.lobby.addRoom(newRoom._id, newRoom.name, newRoom.image, []);
                this.redrawList();
            })
            .catch(error => console.error('Error adding room:', error));
            this.inputElem.value = '';
        });
        //only after service.getRoom ret with no eorrors.
        this.lobby.onNewRoom = (room) => {
            const listItem = createDOM(`
                <li>
                    <a href="#/chat/${room._id}">${room.name}</a>
                </li>
            `);
            this.listElem.appendChild(listItem);
        };
    }

    redrawList() {
        this.listElem.innerHTML = '';
        for (const _id in this.lobby.rooms) {
            const room = this.lobby.rooms[_id];
            const listItem = createDOM(`
                <li>
                    <a href="#/chat/${_id}">${room.name}</a>
                </li>
            `);
            this.listElem.appendChild(listItem);
        }
    }
}

function getSentimentColor(label, score) {
    let red = 0, green = 0, blue = 0;
    switch (label) {
        case 'LABEL_0': 
            red = 255; 
            green = 255 * (1 - score); 
            blue = 255 * (1 - score); 
            break;
        case 'LABEL_1': 
            red = 255 * score + 128 * (1 - score); 
            green = 255 * score + 128 * (1 - score); 
            blue = 255 * score + 128 * (1 - score); 
            break;
        case 'LABEL_2': 
            red = 255 * (1 - score);
            green = 255; 
            blue = 255 * (1 - score); 
            break;
        default:
           
            red = 200; 
            green = 200;
            blue = 200; 
    }
    red = Math.floor(red);
    green = Math.floor(green);
    blue = Math.floor(blue);

    return `rgb(${red}, ${green}, ${blue})`;
}

class ChatView{
    //will create the DOM inside constructor and assign to elem
    constructor(socket){
        this.socket = socket;
        this.elem = createDOM(`
        <div class="content">
            <h4 class="room-name">CHAT ROOM</h4>
            <div class="message-list"></div>
            <textarea placeholder="message ..."></textarea>
            <button>Send</button>
        </div>
    `);
        //store references to descendents elems for chat DOM
        this.titleElem = this.elem.querySelector('.room-name');
        this.chatElem = this.elem.querySelector('.message-list');
        this.inputElem = this.elem.querySelector('textarea');
        this.buttonElem = this.elem.querySelector('button');

        //wheel event listener in the this.chatElem element.
        this.chatElem.addEventListener('wheel', (event) => this.onScroll(event));


        //need to implement addtional stuff here!!!!! wheel event listener
        //Invoke the generator's next function, only if the following conditions are met:
        //The scroll is at the top of the view
        //Mouse scroll direction is "up"
        //this.room.canLoadConversation is true
        this.room = null;

        this.buttonElem.addEventListener('click', () => {
            this.sendMessage();
        });

        this.inputElem.addEventListener('keyup', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                this.sendMessage();
            }
        });         
        }

        setRoom(room) {
            this.room = room;
            this.roomId = room.id;
            emptyDOM(this.titleElem);
            this.titleElem.textContent = room.name;
            emptyDOM(this.chatElem);

            this.room.onFetchConversation = (conversation) => {
                const scrollHeightBefore = this.chatElem.scrollHeight;
                const scrollHeightAfter = this.chatElem.scrollHeight;   
                this.chatElem.scrollTop += scrollHeightAfter - scrollHeightBefore;
            }

            for (const i in this.room.messages) {
                const message = this.room.messages[i];
                const score = parseFloat(message.sentiment.score);
                const label = message.sentiment.label;
                const color = getSentimentColor(label, score);
            
                const messageType = message.username === profile.username ? 'my-message' : 'message';
                
                const messageItem = createDOM(`
                    <div class="${messageType}" style="background-color: ${color};">
                        <span class="message-user">${message.username}:</span>
                        <span class="message-text">${message.text}</span>
                    </div>
                `);
                this.chatElem.appendChild(messageItem);
            }

            this.room.onNewMessage = (message) => {
                console.log("onNewMessage received:", message);
                const sentimentLabel = message.sentiment.label;  
                const sentimentScore = parseFloat(message.sentiment.score);  
            
                const color = getSentimentColor(sentimentLabel, sentimentScore);  
            
                const messageType = message.username === profile.username ? 'my-message' : 'message';
                const messageItem = createDOM(`
                    <div class="${messageType}" style="background-color: ${color};">
                        <span class="message-user">${message.username}:</span>
                        <span class="message-text">${message.text}</span>
                    </div>
                `);
            
                this.chatElem.appendChild(messageItem);
                this.chatElem.scrollTop = this.chatElem.scrollHeight;
                if (!this.room.messages.some(msg => msg.text === message.text && msg.username === message.username)) {
                    this.room.messages.push(message);
                }
            };

        }
        
        sendMessage() {
            const text = this.inputElem.value.trim();
            if (this.room && text) {
                const messageToSend = {
                    roomId: this.roomId,
                    username: profile.username,
                    text: text,
                };
                console.log("Sending message:", messageToSend);
                this.socket.send(JSON.stringify(messageToSend));
                this.inputElem.value = ''; 
            }
        }
    }
        

    function validatePassword(password) {
        const minLength = 8;
        const hasUpperCase = /[A-Z]/;
        const hasLowerCase = /[a-z]/;
        const hasNumbers = /\d/;
        const hasSpecialChar = /[\@\#\$\%\^\&\*\(\)\_\+\!]/;
    
        if (password.length < minLength) {
            return "Password must be at least 8 characters long.";
        }
        if (!hasUpperCase.test(password)) {
            return "Password must include at least one uppercase letter.";
        }
        if (!hasLowerCase.test(password)) {
            return "Password must include at least one lowercase letter.";
        }
        if (!hasNumbers.test(password)) {
            return "Password must contain at least one number.";
        }
        if (!hasSpecialChar.test(password)) {
            return "Password must contain at least one special character (@#$%^&*()_+!).";
        }
        return ""; // Return an empty string if the password is valid
    }

    //(version for disabled about button)
   class ProfileView{
    //will create the DOM inside constructor and assign to elem
    constructor(){
        this.elem = createDOM(`<div class = "content">
        <div class = "profile-form">
            <div class = "form-field">
                <label for = "username">username:</label>
                <input type = "text" id = "username" name = "username">
            </div>

            <div class = "form-field">
                <label for = "password">password:</label>
                <input type="password" id="password" placeholder="New password" />
                <div id="passwordMessage"></div>
            </div>

        </div>
        <div class = "page-control">
            <button id="saveButton">Save</button>
        </div>

        <div>
        <button id="logoutButton">Logout</button>
        </div>
        </div>`);

        this.setupEventListeners();
    }

    setupEventListeners() {
        const saveButton = this.elem.querySelector('#saveButton');
        if (saveButton) {
            saveButton.addEventListener('click', () => {
                this.handleSave();
            });
        }

        const logoutButton = this.elem.querySelector('#logoutButton');
        if (logoutButton) {
            logoutButton.addEventListener('click', () => {
                this.handleLogout();
            });
        }
    }
    handleSave() {
        const username = this.elem.querySelector('#username').value;
        const password = this.elem.querySelector('#password').value; // Ensure this retrieves the value, not the element
        
        const validationMsg = validatePassword(password);

        const messageDisplay = document.getElementById("passwordMessage");

        if (validationMsg !== "") {
            messageDisplay.textContent = validationMsg; // Display the error message
            messageDisplay.style.color = 'red'; // Optional: make the message red for visibility
            return; // Stop the form submission if the password is invalid
        } else {
            messageDisplay.textContent = "Password Updated Successfully!"; // Optional success message
            messageDisplay.style.color = 'green'; // Optional: make the message green for valid password
            // Proceed with submitting the form or updating the profile
        }
    
        // If the password is valid, prepare data for sending
        const userData = {
            username: username,
            password: password,
        };
    
        fetch('/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(userData)
        }).then(response => {
            if (response.ok) {
                window.location.href = '/logout'; 
            } else {
                response.json().then(data => alert(data.message));
            }
        }).catch(error => {
            console.error('Failed to update profile:', error);
            alert('Failed to update profile. Please check the console for more information.');
        });
    }

    handleLogout() {
        fetch('/logout', { method: 'GET' })
            .then(response => {
                if (response.ok) {
                    window.location.href = '/login';  
                } else {
                    alert('Logout failed');
                }
            })
            .catch(error => console.error('Error during logout:', error));
    }
    //new stuff:
    updateProfileFields(userData) {
        const username = this.elem.querySelector('#username');
        const passwordInput = this.elem.querySelector('#password');
        //const about = this.elem.querySelector('#about');

        username.value = userData.username || '';
        passwordInput.value = userData.password || '';
        //about.value = userData.about || '';

    }
}


//Task5 implementation 
function* makeConversationLoader(room) {
    let lastConversationTime = null;

    while (true) {
        if (!room.canLoadConversation) {
            yield new Promise((resolve) => resolve(null));
            continue;
        }
        
        room.canLoadConversation = false;
        
        const conversation = yield Service.getLastConversation(room.id, lastConversationTime);


        if (conversation) {
            room.canLoadConversation = true;
            lastConversationTime = conversation.timestamp;
            room.addConversation(conversation);
            yield new Promise((resolve) => resolve(conversation));
        } else {
            room.canLoadConversation = false;
            yield new Promise((resolve) => resolve(null));
        }

    }

}

class Room {
    //constructs the room object with default values for image and messages
    constructor(id, name, image = "assets/everyone-icon.png", messages = []) {
        this.id = id;
        this.name = name;
        this.image = image;
        this.messages = messages;
        this.onFetchConversation = null;
        this.getLastConversation = makeConversationLoader(this);
        this.canLoadConversation = true;
    }
    addConversation(conversation) {
        this.messages.unshift(...conversation.messages.reverse());

        if (this.onFetchConversation) {
            this.onFetchConversation(conversation);
        }
    }
    //new method: 
    addMessage(username, text, sentiment) {
        console.log(`Room.addMessage called with username: ${username}, text: ${text}, sentiment: ${sentiment}`);
        let message = { username, text, sentiment: sentiment !== undefined ? sentiment : "Sentiment not provided" };
        this.messages.push(message);
    
        if (this.onNewMessage) {
            this.onNewMessage(message);
        }
    }
}

class Lobby {
    //constructs 4 rooms with id's
    constructor() {
        this.rooms = {};
    }

    //getRoom by id method
    getRoom(_id){
        if (_id in this.rooms){
            return this.rooms[_id];
        } 
        return null;
    }

    //adds a room to the room array
    addRoom(_id, name, image, messages) {
        const newRoom = new Room(_id, name, image, messages);
        this.rooms[_id] = newRoom; // Use _id as the key
        if(this.onNewRoom) {
            this.onNewRoom(newRoom);
        }
    }
}

function main() {
    var lobby = new Lobby();

    // Define WebSocket URL
    const ws = 'ws://localhost:8000';

    // Create a new WebSocket instance
    const socket = new WebSocket(ws);
    var lobby = new Lobby();
    const lobbyView = new LobbyView(lobby);
    const chatView = new ChatView(socket);
    const profileView = new ProfileView();

    // Attach a message event handler on the WebSocket instance
    socket.addEventListener("message", (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log("WebSocket message received:", data);

            if (data.roomId && data.sentiment) {
                const room = lobby.getRoom(data.roomId);
                if (room) {
                    console.log("Passing message to room.onNewMessage:", data);
                    room.onNewMessage(data); // data should include sentiment here
                } else {
                    console.error(`Room not found for ID: ${data.roomId}`);
                }
            } else {
                console.error("Received message is missing required properties (roomId or sentiment):", data);
            }
        } catch (error) {
            console.error("Error parsing WebSocket message:", event.data, error);
        }
    });

    refreshLobby();

    Service.getProfile()
    .then(fetchedProfile => {
        profile = fetchedProfile;
        profileView.updateProfileFields(profile);

        // Check for redirect query parameter
        const params = getQueryParams();
        if (params.redirect) {
            window.location.href = params.redirect;
        } else {
            renderRoute();
        }
    })
    .catch(error => {
        console.error('Error fetching profile:', error);
    });

    function getQueryParams() {
        const queryString = window.location.search || window.location.hash; // Check both query string and hash
        if (!queryString) return {};  // Return empty object if no parameters
    
        // If it's a hash URL, strip out the '#' at the start
        const queryPart = queryString.startsWith('#') ? queryString.substring(1) : queryString;
    
        return queryPart.split('&').reduce((params, param) => {
            const [key, value] = param.split('=');
            params[key] = decodeURIComponent(value);
            return params;
        }, {});
    }

    function refreshLobby() {
        Service.getAllRooms().then(rooms => {
            rooms.forEach(room => {
                if (lobby.rooms[room._id]) {
                    lobby.rooms[room._id].name = room.name;
                    lobby.rooms[room._id].image = room.image;
                } else {
                    lobby.addRoom(room._id, room.name, room.image, room.messages);
                }
            });
            lobbyView.redrawList(); 
        }).catch(error => {
            console.error('Error getting rooms:', error);
        });
    }



    /* function renderRoute(){
        const hash = window.location.hash;
        if (hash.startsWith('#/chat/')) {
            const roomId = hash.substring(7);
            const room = lobby.getRoom(roomId);
            if (room) {
                chatView.setRoom(room);
            }
            emptyDOM(document.querySelector('#page-view'));
            document.querySelector('#page-view').appendChild(chatView.elem);
        } else if (hash == '#/profile') {
            emptyDOM(document.querySelector('#page-view'));
            document.querySelector('#page-view').appendChild(profileView.elem);
        } else {
            emptyDOM(document.querySelector('#page-view'));
            document.querySelector('#page-view').appendChild(lobbyView.elem);
        }
    } */

        function renderRoute() {
            const hash = window.location.hash;
            if (hash.startsWith('#/chat/')) {
                const roomId = hash.substring(7);
                window.location.href = `/lobby/chat/${roomId}`;
            } else if (hash === '#/profile') {
                emptyDOM(document.querySelector('#page-view'));
                document.querySelector('#page-view').appendChild(profileView.elem);
            } else {
                fetch('/start')
                    .then(response => response.json())
                    .then(room => {
                        window.location.href = `/lobby/chat/${room._id}`;
                    })
                    .catch(error => console.error('Error redirecting to start:', error));
            }
        }

    window.addEventListener('popstate', renderRoute);
    renderRoute();

    setInterval(refreshLobby, 20000);

    //cpen322.export(arguments.callee, {renderRoute, lobbyView, chatView, profileView, lobby, refreshLobby, socket});
}

window.addEventListener('load', main);