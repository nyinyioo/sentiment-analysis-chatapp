import os
from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher
from openai import OpenAI

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

class ActionChatGPT(Action):

    def name(self):
        return "action_chatgpt"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: dict):

        user_message = tracker.latest_message.get("text")

        # NEW OpenAI API syntax (2024+)
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": user_message}
            ]
        )

        # Correct way to access message content
        bot_reply = completion.choices[0].message.content

        dispatcher.utter_message(text=bot_reply)
        return []
