This is almost exclusively vibecoded so expect some bugs.
Place these files in the same folder as your comfyui .bat file.
Make sure to add the .bat file's path in the launch.bat.
Paste --enable-cors-header into your comfyui .bat file.

The zip file contains all of these files as well as the autocomplete folder with the danbooru, e621, and merged csv files
If you want an notification sound you can paste an mp3 file called notif.mp3 in the same location as these files. (make sure to enable in settings)

The character feature was made with anima's natural language prompting in mind, but can still be used on any other model.

currently known issues:
*I forgot to set the right values for the resolutions so it's whatever claude picked for now. Using custom would be recommended
*Custom themes tend to cause problems so don't import any for now. You can change the fonts without any issues.
*Upscaler models weren't being loaded properly for some reason so I had to hardcode in the upscale models for now.Yyou should be to add your own in the files if it doesn't have an upscaler you like.
*Your models/lora/checkpoints don't save between sessions so make sure to set them each time you load it up.
*The automatic (embedded) for the vae sometimes works, but mostly doesn't work so just select the vae manually.
*I had trouble getting an add noise feature to work so i had to disable it for now. It's still visible in the settings and on the enhance mode but it doesn't do anything yet.
*It doesn't have every sampler name and scheduler yet.
*Hovering over the about history icon displays the card under the images instead of over them.
*Download zip doesn't actually download all of your history as a zip. It just prompts you to download each image.
*There is no reload icon next to the diffusion checkpoints so you have to hit the reload icon on the regular checkpoints to reload them.
*Enhancing an image doesn't use your diffusion model and instead uses the current regular checkpoint. you can "fix" this by just upscaling an image and doing an img2img of it since it is the same thing.
*Tags with modifiers, (cat:1.2), should be highlighted depending on their strength. idk why but it stopped working
