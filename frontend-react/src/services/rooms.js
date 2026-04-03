/**
 * services/room.js
 * 
 * - Implements: 
 * - getRooms()    fetches all rooms 
 * - createRoom()  creates a new room
 * - deleteRoom()  delete a room by ID
 */

/**
 * get all rooms from backend express servers 
 * 
 * @returns {Array} list of room object [{_id, name, image, messages}]
 */
export async function getRooms(){
    const res = await fetch ('/api/lobby/chat')
    if (!res.ok) throw new Error ('Failed to load rooms')
    return res.json()
}

/**
 * creates a new room 
 * @param {string} name - the room name
 * @returns {Array} created room object [{_id, name, image, messages}]
 */
export async function createRoom(name){
    const res = await fetch ('/api/lobby/chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name }),
    })

    if (!res.ok){
        const data = await res.json()
        throw new Error (data.error || "Failed to create a room")
    }

    return res.json()
}

/**
 * delete a room by ID
 * @param {string} id - the room _id
 */
export async function deleteRoom(id){
    const res = await fetch (`/api/lobby/chat/${id}`, {
        method: 'DELETE'
    })
    if (!res.ok) throw new Error ('Failed to delete room')
}


/**
 * getMessage for a room from the DB
 * 
 * @param  {string}  roomId
 * @return {Object} conversation object {messages: []} 
 */
export async function getMessages(roomId){
    const res = await fetch (`/api/lobby/chat/${roomId}/messages`)
    if (!res.ok) throw new Error ('Failed to load messages')
    return res.json()
}

/**
 * deletes messages for demo room
 */
export async function deleteDemoMessages(roomID){
    await fetch ('/api/lobby/chat/demo-cleanup', {method: 'DELETE'})
}
