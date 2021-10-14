#!/usr/bin/python
#
# Simple multi-user signal server using socketio
#
from aiohttp import web
import socketio

LOBBY = 'lobby'

sio = socketio.AsyncServer(cors_allowed_origins='*')
app = web.Application()
sio.attach(app)

roomed_users = {}

@sio.event
async def connect(sid, environ):
    print("connect sid={}".format(sid))

async def forget(sid):
    sio.leave_room(sid, LOBBY)
    del roomed_users[sid]
    peers = { "exit": [ sid ] }
    await sio.emit('peers', peers, room=LOBBY, skip_sid=sid)


@sio.event
async def disconnect(sid):
    print("disconnect: sid={}".format(sid))
    if LOBBY in sio.rooms(sid):
        await forget(sid)


@sio.event
async def signal(sid, data):
    # data = { "id": "123abc", "signal" : "signal string" }
    try:
        # tid = target_id
        tid = data["id"]
        message = { "id" : sid, "signal" : data["signal"] }
        print("signal: sid={} --> tid={} signal={}".format(sid, tid, data["signal"]))
        await sio.emit('signal', message, room=tid)
    except:
        print("malformed data: sid={} data={}".format(sid, str(data)))

@sio.event
async def enter_lobby(sid, data):
    if not LOBBY in sio.rooms(sid):
        username = "unknown"
        try:
            username = data["username"]
        except:
            pass
        session = { "username" : username }
        await sio.save_session(sid, session)

        # tell everyone else about sid
        # peer_changes = { "enter": [ tuple, ... ] }
        # where tuple = (id, username)
        peer_changes = { "enter": [(sid, username)] }
        await sio.emit('peers', peer_changes, room=LOBBY, skip_sid=sid)

        # tell sid about everyone else
        peer_changes = []
        for key, value in roomed_users.items():
            peer_changes.append( (key, value) ) 
        print("adebug roomed_users='{}'".format(roomed_users))
        peer_changes = { "enter": peer_changes }
        await sio.emit('peers', peer_changes, room=sid)

        sio.enter_room(sid, LOBBY)
        roomed_users[sid] = username
        
        print("enter_lobby: sid={} username='{}'".format(sid, username))

@sio.event
async def leave_lobby(sid, data):
    print("leave_lobby: sid={}".format(sid))
    if LOBBY in sio.rooms(sid):
        await forget(sid)


if __name__ == '__main__':
    web.run_app(app, port=9999)
