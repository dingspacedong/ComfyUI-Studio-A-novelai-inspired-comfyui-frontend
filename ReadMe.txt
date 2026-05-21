This is almost exclusively vibecoded so expect some bugs.
Place these files in the same folder as your comfyui .bat file.
Make sure to add the .bat file's path in the launch.bat.
Paste --enable-cors-header into your comfyui .bat file.

The zip file contains all of these files as well as the autocomplete folder with the danbooru, e621, and merged csv files
If you want an notification sound you can paste an mp3 file called notif.mp3 in the same location as these files. (make sure to enable in settings)

The character feature was made with anima's natural language prompting in mind, but can still be used on any other model.
I'll eventually post an example of how I personally use this feature.

currently known issues:
*I forgot to set the right values for the resolutions so it's whatever claude picked for now. Using custom would be recommended
*Upscaler models weren't being loaded properly for some reason so I had to hardcode in the upscale models for now. You should be to add your own in the files if it doesn't have an upscaler you like.
*The automatic (embedded) for the vae sometimes works, but sometimes doesn't work so just select the vae manually.
*Download zip doesn't actually download all of your history as a zip. It just prompts you to download each image.
