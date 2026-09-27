import { Component } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';

@Component({ selector: 'relay-check', template: 'Ordinary Angular page available' })
class RelayCheck {}

void bootstrapApplication(RelayCheck);
